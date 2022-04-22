const ask = require('./ask');

module.exports = async (_backupAddress, _trapAddress) => {
	const sure = await ask({
		name: `trapAddress`,
		message: `Are you sure backup from ${_trapAddress} to ${_backupAddress}?`,
		hint: `(yes)`,
		initial: 'Y'
	});
	return sure;
};
