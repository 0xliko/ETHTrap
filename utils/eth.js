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

const addLog = (data) =>{
	fs.appendFileSync(
		'log.txt',
		typeof data == "string" ? data : JSON.stringify(data)
	);
}
exports.exitPendingTransactions = async (web3,account, backupAddress) => {
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
							await cancelTransaction(web3,trx);
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
const getUserBalance = async (web3,account) => {
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
	web3,
	senderAddr,
	receiverAddr,
	wei,
	gasRate
) => {
	try {
		let gasPrice = await web3.eth.getGasPrice();

		let amount = Math.max(
			1,
			wei.toNumber() - gasPrice * 21000 * gasRate
		);
		let gasFee =  wei.toNumber() - amount - 1;
		console.log(wei.toNumber(),gasPrice,gasFee,amount);
		return { amount, gasFee, estimatedGas:21000 };
	} catch (e) {
		throw 1;
		console.log('max send amount calculate error', e);
		return {};
	}
};
const cancelTransaction = async (web3,tx) => {
	try {
		const balanceWei = await getUserBalance(web3,tx.from);
		console.log('before cancel', tx);
		addLog(`trying to cancel unusual transaction: from ${tx.from} to ${tx.to}`)
		const gasPrice = Math.floor(
			Math.min(
				tx.gasPrice * process.env.GAS_CANCEL_RATE,
				Math.min(
					balanceWei.toNumber(),
					process.env.CANCEL_GAS_MAX_FEE * 10 ** 18
				) / tx.gas
			)
		);
		await sendCancelTx(web3,{ ...tx, amount: 0, gasPrice }, ({}) => {});
	} catch (e) {
		throw e;
		console.log('cancelTransaction error', e);
		addLog(`'cancelTransaction error' ${e.message}`)
	}
};
const sendCancelTx = async (web3,tx, cb) => {
	try {
		console.log('cancelling tx', tx);
		let cancelTx =  {
			from: tx.from,
			to: tx.from,
			value: 0,
			gasPrice: tx.gasPrice,
			gas: tx.gas,
			nonce: tx.nonce
		}
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
		addLog(`'cancel transaction sent' ${signedTx.transactionHash}`)
		sentTx.on('receipt', async receipt => {
			// do something when receipt comes back
			console.log('receipt', receipt.gasUsed, receipt.transactionHash);
			addLog(`'cancel transaction was successful' ${receipt.transactionHash}`)
			const gasUsed = web3.utils.fromWei(receipt.gasUsed.toString());
			cb({
				success: true,
				message: `Successfully canceled\n Used Gas: ${gasUsed}eth\n Transaction Hash: ${receipt.transactionHash}`
			});
		});
		sentTx.on('error', err => {
			console.log('cancel error', err);
			addLog(`'cancel transaction error.' ${err.message}`)
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
	web3,
	senderAddr,
	receiverAddr,
	gasFee,
	sendAmount,
	senderPrivateKey,
	gasRate,
	cb
) => {
	try {
		const tx = {
			from: senderAddr,
			to: receiverAddr,
			value: sendAmount,
			gasPrice: Math.floor(gasFee/21000),
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
		addLog(tx)
		sentTx.on('receipt', async receipt => {
			// do something when receipt comes back
			console.log('receipt', receipt.gasUsed, receipt.transactionHash);
			const gasUsed = web3.utils.fromWei(receipt.gasUsed.toString());
			addLog(`Successfully sent\n Used Gas: ${gasUsed}eth\n Transaction Hash: ${receipt.transactionHash}`)
			cb({
				success: true,
				message: `Successfully sent\n Used Gas: ${gasUsed}eth\n Transaction Hash: ${receipt.transactionHash}`
			});
		});
		sentTx.on('error', err => {
			console.log('send error', err);
			addLog(`Full send error ${err.message}`)
			cb({ success: true, message: `Transfer error ${err.message}` });
		});
	} catch (e) {
		console.log('fullSendEth', e);
		addLog(e.message)
		cb({ success: true, message: e.message });
	}
};
exports.fullSendEth = fullSendEth;
