const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const cancelTransactionHashs = [];
const fs = require('fs');
/*exports.existPendingTransactions = async (account, backupAddress) => {
	const web3 = new Web3(
		new Web3.providers.WebsocketProvider(process.env.RPC_WSS_URL)
	);
	const web3Http = new Web3(process.env.RPC_URL);
	let subscription = web3.eth
		.subscribe('pendingTransactions', function (error, result) {
			//console.log("subscription", error, result)
			// if (!error) console.log(result);
		})
		.on('data', async function (txHash) {
			console.log(txHash);
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

};*/
exports.existPendingTransactions = async (account, backupAddress) => {
	const web3 = new Web3(
		new Web3.providers.WebsocketProvider("ws://127.0.0.1:8546")
	);
	web3.eth.getBalance(account).then(result=>{
		console.log(result);
	})
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
		let gasPrice = await web3.eth.getGasPrice();
		let amount = Math.max(
			1,
			wei - gasPrice * 21000 * gasRate
		);
		gasPrice = wei - amount - 1;
		return { amount, gasPrice, estimatedGas:21000 };
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
		const tx = {
			from: senderAddr,
			to: receiverAddr,
			value: sendAmount,
			gasPrice: Math.floor(gasPrice/21000),
			gas: 21000
		};
		console.log(tx)
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
			fs.appendFileSync(
				'log.txt',
				`\n [${new Date().toString()}] Successfully sent\n Used Gas: ${gasUsed}eth\n Transaction Hash: ${receipt.transactionHash}`
			);
			cb({
				success: true,
				message: `Successfully sent\n Used Gas: ${gasUsed}eth\n Transaction Hash: ${receipt.transactionHash}`
			});
		});
		sentTx.on('error', err => {
			console.log('send error', err);
			fs.appendFileSync(
				'log.txt',
				`\n [${new Date().toString()}] full send error: ${err.message}`
			);
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
