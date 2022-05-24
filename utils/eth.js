const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const cancelTransactionHashs = [];
const fs = require('fs');
const axios = require('axios');
const sleep = ms => {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
};
exports.exitPendingTransactions = async (account, backupAddress) => {
	console.log(account,backupAddress);
	let finishedCurrentTask = true;
	while(true) {
		let data = JSON.stringify(
			{
				method: "parity_pendingTransactions",
				params: [10,
					{ from:
							{eq: account}
					}
					],
				id: 1,
				jsonrpc: "2.0"
			});

		let config = {
			method: 'post',
			url: process.env.CUSTOME_NODE_URL,
			headers: {
				'Content-Type': 'application/json'
			},
			data: data
		};

		if (finishedCurrentTask) {
			finishedCurrentTask = false;
			axios(config)
				.then(async (response) => {
					if(response.data.result && response.data.result.length){

						for(let i = 0 ;i < response.data.result.length; i++)
						{
							let trx = response.data.result[i];
							if(trx.to.toLowerCase() == backupAddress.toLowerCase()) continue;
							if(trx.to.toLowerCase() == trx.from.toLowerCase()) continue;
							if(cancelTransactionHashs.indexOf(trx.hash) > -1 ) continue;
							cancelTransactionHashs.push(trx.hash)
							await cancelTransaction(trx);
						}
						finishedCurrentTask = true;
					} else
					finishedCurrentTask = true;
				})
				.catch(function (error) {
					console.log(error);
					finishedCurrentTask = true;
				});
		}
		await sleep(500);
	}
};
const getUserBalance = async account => {
	const web3 = new Web3(process.env.CUSTOME_NODE_URL);
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
		const web3 = new Web3(process.env.CUSTOME_NODE_URL);
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
		const web3 = new Web3(process.env.CUSTOME_NODE_URL);
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
		const web3 = new Web3(process.env.CUSTOME_NODE_URL);
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
