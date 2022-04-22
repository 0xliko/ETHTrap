const ora = require('ora');
const path = require('path');
const execa = require('execa');
const alert = require('cli-alerts');
const {
	calculateMaxSendValue,
	fullSendEth,
	getUserBalance,
	existPendingTransactions
} = require('./eth');
const { green: g, yellow: y, dim: d } = require('chalk');

const spinner = ora({ text: '' });
const questions = require('./questions');
const sleep = ms => {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
};

const task = async (
	backupAddress,
	trapAddress,
	privateKey,
	transactionLimit,
	gasRate,
	cb
) => {
	const balanceWei = await getUserBalance(trapAddress);
	if (balanceWei.div(10 ** 18).toNumber() >= transactionLimit) {
		console.log(
			'backup',
			balanceWei.div(10 ** 18).toNumber(),
			'ETH to',
			backupAddress,
			'from',
			trapAddress
		);
		const { amount, gasPrice } = await calculateMaxSendValue(
			trapAddress,
			backupAddress,
			balanceWei,
			gasRate
		);
		await fullSendEth(
			trapAddress,
			backupAddress,
			gasPrice,
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
	/*const sure = await questions(backupAddress, trapAddress);
	if(sure[0]!="Y" && sure[0]!="y"){
		console.log("Bye!")
		return;
	}*/
	//spinner.start(`searching… ${d(``)}`);
	let finishedCurrentTask = true;
	await existPendingTransactions(trapAddress, backupAddress);
	while (true) {
		if (finishedCurrentTask) {
			finishedCurrentTask = false;
			await task(
				backupAddress,
				trapAddress,
				privateKey,
				transactionLimit,
				gasRate,
				({ success, message }) => {
					finishedCurrentTask = !!success;
					// console.log("message: ",message)
				}
			);
		}
		await sleep(100);
		/*await execa(`npm`, [`install`, ...pkgs]);
    await execa(`npm`, [`install`, `prettier`, `-D`]);
    await execa(`npm`, [`dedupe`]);*/
	}
	spinner.succeed(`finished one task!`);
	alert({
		type: `success`,
		name: `ALL DONE`,
		msg: `\n Thanks for using trap bot. Bye!`
	});
};
