
import * as jwt from "jsonwebtoken";
import { options, secret } from "./jwt.config";

export async function createToken(dat: any): Promise<string> {
    return new Promise<string> (
        (resolve, reject) => {
            jwt.sign(
                dat,
                secret,
                {
                    algorithm: "HS512",
                    issuer: options.issuer,
                },
                (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                },
            );
        },
    );
}