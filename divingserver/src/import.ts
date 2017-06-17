import { QueryResult } from "@types/pg";
import * as express from "express";
import { IUserRow, login } from "./auth";
import { createToken } from "./jwt";
import { database } from "./pg";

export const router  = express.Router();

interface IComputerSample {
    Time: number;
    Depth: number;
    Temperature: number;
}

interface IComputerDive {
    Fingerprint: string;
    Date: string;
    DiveTime: string;
    MaxDepth: number;
    MaxTemperature: number;
    MinTemperature: number;
    SurfaceTemperature: number;
    Samples: IComputerSample[];
}

interface IComputerImport {
    Computer: {
        Name: string;
        Vendor: string;
        Model: number;
        Type: number;
        Serial: number;
    };
    Dives: IComputerDive[];
}

router.get("/", async (req, res) => {

    const session: QueryResult = await database.call(
        `select
              ses.session_id
            , ses.last_used
            , usr.user_id
            , usr.email
            , usr.name
            , (
                select count(*)
                  from dives d
                 where d.user_id = ses.user_id
            ) as total_dive_count
            , 0::int as session_dive_count
           from remote_sessions ses
           join users usr on ses.user_id = usr.user_id
           where ses.session_id = $1
        `,
        [req.user.session_id],
    );

    if (session.rows.length === 0) {
        res.status(401);
        res.json({ error: "Invalid authentication token" });
    }

    res.json(
        session.rows[0],
    );
});

// router.post("/", async (req, res) => {
//     const userid = req.user.user_id;

//     const d = req.body as IComputerImport;
//     const qs = await database.bulkInsert({
//         data: d.Dives,
//         mapping: {
//             date: { field: "Date" },
//             divetime: { field: "DiveTime", sql: "EXTRACT(EPOCH FROM {value}::interval)" },
//             max_depth: { field: "MaxDepth" },
//             samples: { field: "Samples", transform: (v) => JSON.stringify(v) },
//             user_id: { field: "", transform: () => userid },
//         },
//         table: "dives",
//     });

//     res.json(
//         {
//             inserted: qs.rowCount,
//         },
//     );
// });
