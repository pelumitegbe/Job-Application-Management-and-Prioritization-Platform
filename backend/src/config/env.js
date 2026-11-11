const dotenv = require("dotenv");
const path = require("node:path");
const { getJwtSecret } = require("./auth");
const { parseHttpLogging } = require("../middleware/requestLogger");

// Load variables from backend/.env into process.env (if the file exists).
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const DEFAULT_PORT = 5001;

function readPort() {
	const raw = process.env.PORT;
	if (raw === undefined || raw === "") {
		return DEFAULT_PORT;
	}

	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(
			`Invalid PORT value "${raw}". It must be an integer between 1 and 65535.`,
		);
	}
	return port;
}

function readMongoUri() {
	const uri = process.env.MONGODB_URI;
	if (!uri) {
		throw new Error(
			"MONGODB_URI is not set. Copy .env.example to .env and provide a MongoDB connection string.",
		);
	}
	return uri;
}

function loadConfig() {
	// Fail fast at startup if JWT_SECRET is missing or too short, rather than
	// on the first login request. The secret itself is not stored here.
	getJwtSecret();

	if (parseHttpLogging(process.env.HTTP_LOGGING) === null) {
		throw new Error(
			`Invalid HTTP_LOGGING value "${process.env.HTTP_LOGGING}". Use true or false (or leave it unset).`,
		);
	}

	return {
		port: readPort(),
		mongodbUri: readMongoUri(),
		mongodbDbName: process.env.MONGODB_DB_NAME || "job_application_platform",
	};
}

module.exports = { loadConfig };
