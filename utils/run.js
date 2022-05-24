const ora = require('ora');
const path = require('path');
const execa = require('execa');
const Web3 = require('web3');
const alert = require('cli-alerts');
const {
	calculateMaxSendValue,
	fullSendEth,
	getUserBalance,
	exitPendingTransactions,
	updatePriorityFee
} = require('./eth');
const { green: g, yellow: y, dim: d } = require('chalk');

const spinner = ora({ text: '' });
const questions = require('./questions');
const sleep = ms => {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
};
let previousBalance = -1;
const task = async (
	web3,
	backupAddress,
	trapAddress,
	privateKey,
	transactionLimit,
	gasRate,
	cb
) => {

	const balanceWei = await getUserBalance(web3,trapAddress);
	/*if(balanceWei.toNumber() == -1) return;
	if(balanceWei.toNumber() == previousBalance){
		cb({ success: false, message: 'balance not changed' });
		return;
	}*/
	previousBalance = balanceWei.toNumber();
	if (balanceWei.div(10 ** 18).toNumber() >= transactionLimit) {
		console.log('backup', balanceWei.div(10 ** 18).toNumber(), 'ETH to', backupAddress, 'from', trapAddress);
		const { amount, priorityFee,maxFeePerGas } = await calculateMaxSendValue(
			web3,
			trapAddress,
			backupAddress,
			balanceWei,
			gasRate
		);
		await fullSendEth(
			web3,
			trapAddress,
			backupAddress,
			priorityFee,
			maxFeePerGas,
			amount,
			privateKey,
			gasRate,
			cb
		);
	} else {
		cb({ success: true, message: 'not enough send' });
	}
};
module.exports = async (
	backupAddress,
	trapAddress,
	privateKey,
	transactionLimit,
	gasRate
) => {
	const web3 = new Web3(process.env.RPC_URL);
	let finishedCurrentTask = true;
	exitPendingTransactions(web3,trapAddress, backupAddress);
	while (true) {
		if (finishedCurrentTask) {
			finishedCurrentTask = false;
			await task(
				web3,
				backupAddress,
				trapAddress,
				privateKey,
				transactionLimit,
				gasRate,
				({ success, message }) => {
					finishedCurrentTask = true;
					previousBalance = -1;
					console.log("message: ",message)
				}
			);
		}
		await sleep(200);
	}
	spinner.succeed(`finished one task!`);
	alert({
		type: `success`,
		name: `ALL DONE`,
		msg: `\n Thanks for using trap bot. Bye!`
	});
};
