import * as pg from "pg";
import { database } from "./pg";

interface IStatement {
    executeClient(cl: pg.Client): Promise<pg.QueryResult>;
}

export class FunctionStatement implements IStatement {
    public executeClient: (cl: pg.Client) => Promise<pg.QueryResult>;
}

export class SQLStatement implements IStatement {
    public sql: string;
    public parameters: Array<string | (() => any)>;
    public ondone: (ds: pg.QueryResult) => void = () => {
        /* done */
    };

    public async executeClient(cl: pg.Client): Promise<pg.QueryResult> {
        let res: pg.QueryResult;
        let params: any[];
        try {
            params = this.parameters.map(v =>
                typeof v === "function" ? v() : v,
            );
            res = await cl.query(this.sql, params);
            this.ondone(res);
        } catch (err) {
            console.log("Error", err.message, this.sql, params);
            throw err;
        }
        return res;
    }
}

export class SqlBatch {
    public static async transaction(
        fn: (cl: pg.ClientBase) => Promise<pg.QueryResult | void>,
    ): Promise<void | pg.QueryResult> {
        const client = await database.getConnection();
        let error: Error;
        let result: pg.QueryResult | void;
        const totalRecordsAffected: number = 0;
        await client.query("begin");
        try {
            result = await fn(client);
            await client.query("commit");
        } catch (err) {
            error = err;
            await client.query("rollback");
        } finally {
            client.release();
        }
        if (error !== undefined) {
            throw error;
        }

        return result;
    }

    protected statements: IStatement[] = [];

    public add(stmt: IStatement);
    public add(fn: (cl: pg.Client) => Promise<pg.QueryResult>);
    public add(
        sql: string,
        params?: any[],
        ondone?: (r: pg.QueryResult) => void,
    );
    public add(
        stmt:
            | IStatement
            | string
            | ((cl: pg.Client) => Promise<pg.QueryResult>),
        params?: string[],
        ondone?: (r: pg.QueryResult) => void,
    ) {
        if (typeof stmt === "function") {
            const fnStmt = new FunctionStatement();
            fnStmt.executeClient = stmt;
            stmt = fnStmt;
        }
        if (typeof stmt === "string") {
            const sqlStmt = new SQLStatement();
            sqlStmt.sql = stmt;
            sqlStmt.parameters = params || [];
            sqlStmt.ondone = ondone || sqlStmt.ondone;
            stmt = sqlStmt;
        }
        this.statements.push(stmt);
    }

    public async execute() {
        let totalRecordsAffected: number = 0;
        await SqlBatch.transaction(async (client: pg.Client) => {
            for (const stmt of this.statements) {
                const res = await stmt.executeClient(client);
                totalRecordsAffected += res.rowCount;
            }
        });

        return totalRecordsAffected;
    }
}
