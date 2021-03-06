import * as bluebird from "bluebird";
import { Request } from "express";
import * as jwt from "jsonwebtoken";
import { config } from "./config";
import { HttpError } from "./errors";

export async function createToken(
    dat: any,
    opt: {
        subject?: string;
        expiresIn?: string;
    } = {},
): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const oPar = {
            algorithm: "HS512",
            issuer: config.jwt.issuer,
        } as jwt.SignOptions;
        if (opt.subject) {
            oPar.subject = opt.subject;
        }
        if (opt.expiresIn) {
            oPar.expiresIn = opt.expiresIn;
        }

        jwt.sign(dat, config.jwt.secret, oPar, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

export async function verifyAsync(
    token: string,
    secretOrPublicKey: string | Buffer,
    options?: jwt.VerifyOptions,
): Promise<any> {
    return new Promise((resolve, reject) => {
        jwt.verify(token, secretOrPublicKey, options, (err, dat) => {
            if (err) {
                reject(new HttpError(401, "Invalid JWT; " + err.message));
            } else {
                resolve(dat);
            }
        });
    });
}
