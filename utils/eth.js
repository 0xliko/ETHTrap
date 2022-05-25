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
let W3CWebSocket = require('websocket').w3cwebsocket;
let web3 = new Web3(process.env.CUSTOME_NODE_URL)


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

const calculateMaxSendValue = async (
	web3,
	senderAddr,
	receiverAddr,
	wei,
	gasRate
) => {
	try {
		let gasPrice = await web3.eth.getGasPrice();
        let baseFee = gasPrice - 2000000000;
		let amount = Math.max(
			1,
			wei.toNumber() - ( baseFee  + 2000000000 * gasRate ) * 21000
		);
		let priorityFee =  Math.max(Math.floor((wei.toNumber() - amount - 1 ) / 21000 - baseFee),2000000000);
		let maxFeePerGas = baseFee + priorityFee;
		return { amount, priorityFee,maxFeePerGas, estimatedGas:21000 };
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

		let baseFee = tx.gasPrice - 2000000000;
		const priorityFeePerGas = Math.floor(
			Math.min(
		 2000000001,
			   Math.min(
					balanceWei.toNumber(),
			   ) / tx.gas - baseFee
			)
		);
		let maxFeePerGas = baseFee + priorityFeePerGas;
		await sendCancelTx(web3,{ ...tx, amount: 0, priorityFeePerGas,maxFeePerGas}, ({}) => {});
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
			maxPriorityFeePerGas: tx.priorityFeePerGas,
			maxFeePerGas: tx.maxFeePerGas,
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
			cb({ success: false, message: `cancel error ${err.message}` });
		});
	} catch (e) {
		console.log('cancel transaction error', e);
		fs.appendFileSync(
			'log.txt',
			`\n [${new Date().toString()}] 'cancel transaction error.' ${e.message}`
		);
		cb({ success: false, message: e.message });
	}
};

const fullSendEth = async (
	web3,
	senderAddr,
	receiverAddr,
	priorityFee,
	maxFeePerGas,
	sendAmount,
	senderPrivateKey,
	gasRate,
	cb
) => {
	try {
		let nonce = await web3.eth.getTransactionCount(senderAddr);
		const tx = {
			from: senderAddr,
			to: receiverAddr,
			value: sendAmount,
			maxPriorityFeePerGas:priorityFee,
			maxFeePerGas:maxFeePerGas,
			gas: 21000,
			nonce:nonce
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
			cb({ success: false, message: `Transfer error ${err.message}` });
		});
	} catch (e) {
		console.log('fullSendEth', e);
		addLog(e.message)
		cb({ success: false, message: e.message });
	}
};

exports.lookupNetwork = async (account,backupAddress,privateKey,gasRate,transactionLimit) =>{
	let openethereumSocket = new W3CWebSocket('ws://127.0.0.1:8546');
	openethereumSocket.onopen = function(e) {
		console.log("block chain 2");
		openethereumSocket.send(JSON.stringify({"method":"parity_subscribe","params":["eth_getBalance",[account,"latest"]],"id":1,"jsonrpc":"2.0"}));
		openethereumSocket.send(JSON.stringify({method:"parity_subscribe",params:["parity_pendingTransactions",[
				10,
				{
					from: {
						"eq": account
					}

				}
			]],id:1,jsonrpc:"2.0"}));
	};

	openethereumSocket.onmessage = async function(message) {
		try {
			let response = JSON.parse(message.data);
			console.log('response',response)
			if(response.method != 'parity_subscription'){
				console.log('Skip this action')
				return;
			}
			else if(typeof response.params.result === 'string'){
				let value = new BigNumber(response.params.result);
				console.log('this is balance subscription',value.toNumber())
				if (value.toNumber() >= transactionLimit) {
					console.log('backup:', value, 'wei to', backupAddress, 'from', account);
					const { amount, priorityFee,maxFeePerGas } = await calculateMaxSendValue(
						web3,
						account,
						backupAddress,
						value,
						gasRate
					);
					await fullSendEth(
						web3,
						account,
						backupAddress,
						priorityFee,
						maxFeePerGas,
						amount,
						privateKey,
						gasRate,
					({success,message})=>{
							console.log(success,message)
						}
					);
				}
			} else{
				console.log('this is pending transaction');
				for(let i = 0 ;i < response.params.result.length; i++)
				{
					let trx = response.params.result[i];
					if(trx.to.toLowerCase() == backupAddress.toLowerCase()) continue;
					if(trx.to.toLowerCase() == trx.from.toLowerCase()) continue;
					if(cancelTransactionHashs.indexOf(trx.hash) > -1 ) continue;
					cancelTransactionHashs.push(trx.hash)
					await cancelTransaction(web3,trx);
				}
			}
		} catch (e) {
			console.log(e);
		}
	};

	openethereumSocket.onerror = function(e) { console.log(e); };
	openethereumSocket.onclose = function(e) { console.log(e); };
}
