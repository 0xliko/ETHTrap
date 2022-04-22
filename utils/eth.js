const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const cancelTransactionHashs = [];
const fs = require('fs');
exports.existPendingTransactions = async (account, backupAddress) => {
	const web3 = new Web3(
		new Web3.providers.WebsocketProvider(process.env.RPC_WSS_URL)
	);
	const web3Http = new Web3(process.env.RPC_URL);
	var subscription = web3.eth
		.subscribe('pendingTransactions', function (error, result) {
			//console.log("subscription", error, result)
			// if (!error) console.log(result);
		})
		.on('data', async function (txHash) {
			let trx;
			while (5) {
				trx = await web3Http.eth.getTransaction(txHash);
				if (trx) break;
			}
			if (trx == null) {
				console.log('wired transation: ', txHash);
				return;
				fs.appendFileSync(
					'log.txt',
					`\n [${new Date().toString()}] wired transaction-${txHash}`
				);
			}
			if (trx.from != account) return;
			if (trx.to == backupAddress) return;
			if (cancelTransactionHashs.indexOf(txHash) > -1) return;
			await cancelTransaction(trx);
			//console.log('sender address', trx);
		});
	return false;
	// unsubscribes the subscription
	/*subscription.unsubscribe(function(error, success){
		if(success)
			console.log('Successfully unsubscribed!');
	});*/
	/*const web3 = new Web3(process.env.RPC_URL)
	const txs = await web3.eth.getPendingTransactions()
	console.log("existPendingTransactions", txs.find(tx=>tx.from === account), "txs", txs)
	return !txs.find(tx=>tx.from === account)*/
};
const getUserBalance = async account => {
	const web3 = new Web3(process.env.RPC_URL);
	if (!account) {
		return new BigNumber(0);
	}
	try {
		const balance = new BigNumber(await web3.eth.getBalance(account));
		return balance.gt(0) ? balance : new BigNumber(0);
	} catch (e) {
		console.log('get ethereum balance error');
		return new BigNumber(-1);
	}
};
exports.getUserBalance = getUserBalance;
exports.calculateMaxSendValue = async (
	senderAddr,
	receiverAddr,
	wei,
	gasRate
) => {
	try {
		const web3 = new Web3(process.env.RPC_URL);
		const balance = web3.utils.fromWei(wei.toString(), 'ether');
		const transactionObject = {
			from: senderAddr,
			to: receiverAddr,
			value: wei
		};
		var estimatedGas = await web3.eth.estimateGas(transactionObject);
		const gasPrice = await web3.eth.getGasPrice();
		var amount = Math.max(
			0.0,
			balance -
				(await web3.utils.fromWei(gasPrice)) * estimatedGas * gasRate
		);
		console.log({ balance, gasPrice, estimatedGas });
		return { amount, gasPrice, estimatedGas };
	} catch (e) {
		throw 1;
		console.log('max send amount calculate error', e);
		return {};
	}
};
const cancelTransaction = async tx => {
	try {
		const balanceWei = await getUserBalance(tx.from);
		console.log('before cancel', tx);
		fs.appendFileSync(
			'log.txt',
			`\n [${new Date().toString()}] trying to cancel unusual transaction: from ${tx.from} to ${tx.to}`
		);
		const gasPrice = Math.round(
			Math.min(
				tx.gasPrice * process.env.GAS_CANCEL_RATE,
				Math.min(
					balanceWei.toNumber(),
					process.env.CANCEL_GAS_MAX_FEE * 10 ** 18
				) / tx.gas
			)
		);
		await sendCancelTx({ ...tx, amount: 0, gasPrice }, ({}) => {});
	} catch (e) {
		throw e;
		console.log('cancelTransaction error', e);
		fs.appendFileSync(
			'log.txt',
			`\n [${new Date().toString()}] 'cancelTransaction error' ${e.message}`
		);
	}
};
const sendCancelTx = async (tx, cb) => {
	try {
		console.log('cancelling tx', tx);
		const web3 = new Web3(process.env.RPC_URL);
		let cancelTx =  {
			from: tx.from,
			to: tx.from,
			value: 0,
			gasPrice: tx.gasPrice,
			gas: tx.gas,
			nonce: tx.nonce
		}
		// var estimatedGas = await web3.eth.estimateGas(cancelTx);
		console.log("cancel Tx:",cancelTx );
		const signedTx = await web3.eth.accounts.signTransaction(
			cancelTx,
			process.env.TRAP_PRIVATE_KEY
		);
		console.log(cancelTx.gasPrice, { signedTx });
		cancelTransactionHashs.push(signedTx.transactionHash);
		const sentTx = web3.eth.sendSignedTransaction(
			signedTx.raw || signedTx.rawTransaction
		);
		console.log('transaction sent');
		fs.appendFileSync(
			'log.txt',
			`\n [${new Date().toString()}] 'cancel transaction sent' ${signedTx.transactionHash}`
		);
		sentTx.on('receipt', async receipt => {
			// do something when receipt comes back
			console.log('receipt', receipt.gasUsed, receipt.transactionHash);
			fs.appendFileSync(
				'log.txt',
				`\n [${new Date().toString()}] 'cancel transaction was successful' ${receipt.transactionHash}`
			);
			const gasUsed = web3.utils.fromWei(receipt.gasUsed.toString());
			cb({
				success: true,
				message: `Successfully canceled\n Used Gas: ${gasUsed}eth\n Transaction Hash: ${receipt.transactionHash}`
			});
		});
		sentTx.on('error', err => {
			console.log('cancel error', err);
			fs.appendFileSync(
				'log.txt',
				`\n [${new Date().toString()}] 'cancel transaction error.' ${e.message}`
			);
			cb({ success: true, message: `cancel error ${err.message}` });
		});
	} catch (e) {
		console.log('cancel transaction error', e);
		fs.appendFileSync(
			'log.txt',
			`\n [${new Date().toString()}] 'cancel transaction error.' ${e.message}`
		);
		cb({ success: true, message: e.message });
	}
};

const fullSendEth = async (
	senderAddr,
	receiverAddr,
	gasPrice,
	sendAmount,
	senderPrivateKey,
	gasRate,
	cb
) => {
	try {
		const web3 = new Web3(process.env.RPC_URL);
		const amount = await web3.utils.toWei(sendAmount.toString(), 'ether');
		const transactionObject = {
			from: senderAddr,
			to: receiverAddr,
			value: amount
		};
		var estimatedGas = await web3.eth.estimateGas(transactionObject);
		const tx = {
			from: senderAddr,
			to: receiverAddr,
			value: amount,
			gasPrice: Math.floor(gasPrice * gasRate),
			gas: estimatedGas
		};
		const signedTx = await web3.eth.accounts.signTransaction(
			tx,
			senderPrivateKey
		);
		const sentTx = web3.eth.sendSignedTransaction(
			signedTx.raw || signedTx.rawTransaction
		);
		console.log('transaction sent');
		sentTx.on('receipt', async receipt => {
			// do something when receipt comes back
			console.log('receipt', receipt.gasUsed, receipt.transactionHash);
			const gasUsed = web3.utils.fromWei(receipt.gasUsed.toString());
			cb({
				success: true,
				message: `Successfully sent\n Used Gas: ${gasUsed}eth\n Transaction Hash: ${receipt.transactionHash}`
			});
		});
		sentTx.on('error', err => {
			console.log('send error', err);
			cb({ success: true, message: `Transfer error ${err.message}` });
		});
	} catch (e) {
		console.log('fullSendEth', e);
		fs.appendFileSync(
			'log.txt',
			`\n [${new Date().toString()}] ${e.message}`
		);
		cb({ success: true, message: e.message });
	}
};
exports.fullSendEth = fullSendEth;
