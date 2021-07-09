module.exports = (results) => {
	const errorCount = results.flatMap((result) => result.messages).length;
	return `Errors: ${errorCount}`;
};