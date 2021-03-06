import * as argon2 from "argon2";
import * as express from "express";
import * as jwt from "express-jwt";
import { config } from "../config";
import { HttpError } from "../errors";
import { Router } from "../express-promise-router";
import { IAuthenticatedRequest } from "../express.interface";
import { createToken } from "../jwt";
import { database } from "../pg";

export const router = Router();

export interface IUserRow {
    user_id: number;
    name: string;
    email: string;
}

function invalidCredentials(res: express.Response): void {
    res.status(401);
    res.json({
        error: "Invalid credentials",
    });
}

function sendError(err: Error, res: express.Response): void {
    res.status(500);
    res.json({
        error: err.message,
    });
}

export async function createRefreshToken(
    userId: number,
    ip: string,
    descr?: string,
): Promise<string> {
    const recs = await database.call(
        `
        insert
        into session_tokens
               (user_id, insert_ip, description)
        values ($1     , $2       , $3)
        returning *
        `,
        [userId, ip, descr || null],
    );

    if (recs.rows.length !== 1) {
        throw new Error("Unexpected error; creation of refresh token failed");
    }

    const tok = await createToken(
        {
            refresh_token: recs.rows[0].token,
            user_id: userId,
        },
        {
            subject: "refresh-token",
        },
    );

    return tok;
}

export async function login(
    email: string,
    password: string,
): Promise<IUserRow> {
    const user = await database.call(
        `
            select
                  user_id
                , email
                , name
                , password
              from users
             where email = $1
        `,
        [email],
    );

    if (!user.rows.length) {
        throw new HttpError(401, "Invalid credentials");
    }

    if (!(await argon2.verify(user.rows[0].password, password))) {
        throw new HttpError(401, "Invalid credentials");
    }

    return {
        email: user.rows[0].email,
        name: user.rows[0].name,
        user_id: user.rows[0].user_id,
    };
}

router.post("/", async (req, res) => {
    const b = req.body;

    try {
        const user = await login(b.email, b.password);

        const tok = await createToken({
            user_id: user.user_id,
        });

        res.json({
            jwt: tok,
        });
    } catch (err) {
        res.status(err.message === "Invalid credentials" ? 401 : 500);
        res.json({
            error: err.message,
        });
    }
});

router.post("/refresh-token", async (req, res) => {
    const b = req.body;

    const user = await login(b.email, b.password);

    const tok = await createRefreshToken(user.user_id, req.ip, b.description);

    res.json({
        jwt: tok,
    });
});

router.get("/refresh-token", async (req: IAuthenticatedRequest, res) => {
    const q = await database.call(
        `
             select *
               from session_tokens
              where user_id = $1
            `,
        [req.user.user_id],
    );
    res.json(q.rows);
});

router.delete(
    "/refresh-token/:token",
    async (req: IAuthenticatedRequest, res) => {
        const q = await database.call(
            `
             delete
               from session_tokens
              where user_id = $1
                and token = $2
            `,
            [req.user.user_id, req.params.token],
        );
        res.json({ deleted: q.rowCount });
    },
);

router.delete(
    "/refresh-token",
    jwt({
        secret: config.jwt.secret,
        issuer: config.jwt.issuer,
        subject: "refresh-token",
        algorithms: ["HS512"],
    }),
    async (req: IAuthenticatedRequest, res) => {
        const clearAll = req.query.all ? true : false;

        const params: any[] = [req.user.user_id];
        if (clearAll) {
            params.push(req.params.token);
        }
        const q = await database.call(
            `
             delete
               from session_tokens
              where user_id = $1
                ${clearAll ? "and token = $2" : ""}
            `,
            params,
        );

        res.json({ deleted: q.rowCount });
    },
);

router.get(
    "/access-token",
    jwt({
        secret: config.jwt.secret,
        issuer: config.jwt.issuer,
        subject: "refresh-token",
        algorithms: ["HS512"],
    }),
    async (req: IAuthenticatedRequest, res) => {
        const dat = req.user;

        const q = await database.call(
            `
            update session_tokens
               set last_used = (current_timestamp at time zone 'UTC')
                 , last_ip =  $3
             where user_id = $1
               and token = $2
         returning *
        `,
            [dat.user_id, dat.refresh_token, req.ip],
        );

        if (!q.rows.length) {
            throw new HttpError(401, "Invalid token given");
        }

        const tok = await createToken(
            { user_id: dat.user_id },
            {
                expiresIn: "1h", // needs to be higher
                subject: "access-token",
            },
        );

        res.json({ jwt: tok });
    },
);

router.post("/register/", async (req, res) => {
    try {
        if (!(req.body.password && req.body.name && req.body.email)) {
            throw new HttpError(
                400,
                "Bad request: Password, email and name required",
            );
        }

        const hash = await argon2.hash(req.body.password);

        const db = await database.call(
            `
                    insert into users
                                (email, password, name)
                        values  ($1, $2, $3)
                        returning user_id
                `,
            [req.body.email, hash, req.body.name],
        );

        res.json({
            user_id: db.rows[0].user_id,
        });
    } catch (err) {
        res.status(err.message === "Invalid credentials" ? 401 : 500);
        res.json({
            error: err.message,
        });
    }
});
