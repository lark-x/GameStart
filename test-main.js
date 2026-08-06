const { pathToFileURL } = require("node:url");
console.log("process.argv[1]:", process.argv[1]);
console.log("pathToFileURL:", pathToFileURL(process.argv[1]).href);
