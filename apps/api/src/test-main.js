import { pathToFileURL } from "node:url";
console.log("entry:", process.argv[1]);
console.log("pathToFileURL:", pathToFileURL(process.argv[1]).href);
console.log("import.meta.url:", import.meta.url);
console.log("isMainModule:", import.meta.url === pathToFileURL(process.argv[1]).href);
