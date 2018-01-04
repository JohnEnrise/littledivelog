import * as Ajv from "ajv";
import * as fs from "fs";

interface IConfig {
    http: {
        port: number|string;
    };
    database: {
        host: string;
        database: string;
        username: string;
        port?: number;
        password?: string;
    };
}

export let config: IConfig = {
    http: {
        port: 3000,
    },
    database: {
        host: "please.provide.a.valid.config.json",
        username: "uname",
        database: "sample.db",
    },
};

const ajv = Ajv();
const validator = ajv.compile({
    type: "object",
    properties: {
        http: {
            type: "object",
            properties: {
                port: { type: "number" },
            },
            required: ["port"],
        },
        database: {
            type: "object",
            properties: {
                host: { type: "string" },
                username: { type: "string" },
                database: { type: "string" },
                port: { type: "string" },
                password: { type: "string" },
            },
            required: ["host", "username"],
        },
    },
    required: ["http", "database"],
});

export async function readConfig(path: string): Promise<IConfig> {

    return new Promise<IConfig>((resolve, reject) => {
        fs.readFile(path, { encoding: "utf8" }, (err, data) => {
            if (err) {
                return reject(err);
            }
            try {
                config = JSON.parse(data);
                if (!validator(config)) {
                    throw new Error(ajv.errorsText(validator.errors));
                }
                return resolve(config);
            } catch (err) {
                return reject(err);
            }

        });

    });
}
