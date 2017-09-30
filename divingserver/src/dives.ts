import * as express from "express";
import { QueryResult } from "pg";
import { isPrimitive } from "util";
import { database } from "./pg";
import { SqlBatch } from "./sql";

export const router  = express.Router();

interface IBuddy {
    buddy_id?: number;
    text: string;
    color: string;
}

interface ITag {
    tag_id?: number;
    text: string;
    color: string;
}

interface IPlace {
    place_id?: number;
    name: string;
    country_code: string;
}

function injectPlaceSql(oPar: {
    batch: SqlBatch,
    place: IPlace,
}): void {
    if (!oPar.place.place_id) {
        oPar.batch.add(
            "insert into places (name, country_code) values ($1, $2) returning *",
            [oPar.place.name, oPar.place.country_code],
            (res) => {
                oPar.place.place_id = res.rows[0].place_id;
            },
        );
    }
}

function injectBuddySql(oPar: {
    userId: number,
    diveId: number|(() => number),
    batch: SqlBatch,
    buddies: IBuddy[],
}): void {

    oPar.buddies.forEach((buddy) => {
        if (buddy.buddy_id !== undefined) {
            return;
        }

        oPar.batch.add(
            "insert into buddies (text, color, user_id) values ($1, $2, $3) returning *",
            [buddy.text, buddy.color, oPar.userId],
            (ds) => { buddy.buddy_id = ds.rows[0].buddy_id; },
        );
    });

    oPar.buddies.forEach((buddy) => {
        oPar.batch.add(
            "insert into dive_buddies (dive_id, buddy_id) values ($1, $2)",
            [oPar.diveId, () => buddy.buddy_id],
        );
    });
}

function injectTagSql(oPar: {
    userId: number,
    diveId: number|( () => number ),
    batch: SqlBatch,
    tags: ITag[],
}): void {

    oPar.tags.forEach((tag) => {
        if (tag.tag_id !== undefined) {
            return;
        }

        oPar.batch.add(
            "insert into tags (text, color, user_id) values ($1, $2, $3) returning *",
            [tag.text, tag.color, oPar.userId],
            (ds) => {  tag.tag_id = ds.rows[0].tag_id; },
        );
    });

    oPar.tags.forEach((tag) => {
        oPar.batch.add(
            "insert into dive_tags (dive_id, tag_id) values ($1, $2)",
            [oPar.diveId, () => tag.tag_id],
        );
    });
}

router.get("/", async (req, res) => {
    const dives: QueryResult = await database.call(
        `select dive_id, divetime, date, tags, place
           from get_dives($1) d
        `,
        [req.user.user_id],
    );

    res.json(
        dives.rows,
    );
});

router.get("/:id", async (req, res) => {

    const dives: QueryResult = await database.call(
        `select *
           from get_dives($1) d
          where dive_id=$2
        `,
        [req.user.user_id, req.params.id],
    );

    res.json(
        dives.rows[0],
    );
});

router.put("/:id", async (req, res) => {

    const userid = req.user.user_id;

    const body = req.body;

    const batch = new SqlBatch();

    if (body.place) {
        injectPlaceSql({
            batch,
            place: body.place,
        });
    }

    body.tanks = `{"${body.tanks.map((tank) => {
        // tslint:disable-next-line:max-line-length
        return `(${tank.volume},${tank.oxygen},\\"(${tank.pressure.begin},${tank.pressure.end},${tank.pressure.type})\\")`;
    }).join('","')}"}`;
    let sql = "update dives set updated = (current_timestamp at time zone 'UTC')";
    const flds = ["date", "divetime", "max_depth", "tanks"];
    const params = [];
    for (const fld of flds) {
        sql += `, ${fld} = $${params.push(body[fld])}`;
    }
    if (body.place) {
        sql += `, place_id = $${params.push(() => body.place.place_id)}`;
    }

    sql += ` where dive_id = $${params.push(req.params.id)} and user_id = $${params.push(userid)}`;

    batch.add(sql, params, (ds) => {
        if (ds.rowCount !== 1) {
            throw new Error("Unable to update given dive");
        }
    });

    if (body.buddies) {
        batch.add("delete from dive_buddies where dive_id=$1", [req.params.id]);
        injectBuddySql({
            buddies: body.buddies,
            diveId: req.params.id,
            userId: userid,
            batch,
        });
    }
    if (body.tags) {
        batch.add("delete from dive_tags where dive_id=$1", [req.params.id]);
        injectTagSql({
            diveId: req.params.id,
            tags: body.tags,
            userId: userid,
            batch,
        });
    }

    try {
        await batch.execute();

        res.json({
            dive_id: req.params.id,
        });
    } catch (err) {
        res.statusCode = 500;
        res.json({
            error: "UNEXPECTED-SQL-ERROR",
            messge: err.message,
            stacktrace: err.stack,
        });
    }

});

router.post("/", async (req, res) => {

    const userid = req.user.user_id;

    const body = req.body;
    const batch = new SqlBatch();

    body.tanks = `{"${body.tanks.map((tank) => {
        // tslint:disable-next-line:max-line-length
        return `(${tank.volume},${tank.oxygen},\\"(${Math.round(tank.pressure.begin)},${Math.round(tank.pressure.end)},${tank.pressure.type})\\")`;
    }).join('","')}"}`;

    body.user_id = userid;

    const flds = ["date", "divetime", "max_depth", "tanks", "user_id", "computer_id", "fingerprint"];
    const params = flds.map((fld) => body[fld]);

    if (body.place) {
        injectPlaceSql({
            batch,
            place: body.place,
        });
        flds.push("place_id");
        params.push(() => body.place.place_id);
    }

    const sql = `insert into dives
                ( ${flds.join(",")} )
        values  (
            ${flds.map((fld, iX) => "$" + (iX + 1)).join(",")}
        )
        on conflict (computer_id, fingerprint)
          do update
                set updated = now()
        returning dive_id as id, updated, inserted;
    `;
    let diveId: number;
    let skipped: boolean = false;

    batch.add(sql, params, (ds) => {
        if (ds.rowCount !== 1) {
            throw new Error("Unable to update given dive");
        }

        skipped =  ds.rows[0].updated !==  ds.rows[0].inserted;
        console.log("SKIPPED", skipped, ds.rows[0].updated , ds.rows[0].inserted)
        diveId = ds.rows[0].id;
    });

    if (body.buddies) {
        injectBuddySql({
            buddies: body.buddies,
            diveId: () => diveId,
            userId: userid,
            batch,
        });
    }
    if (body.tags) {
        injectTagSql({
            diveId: () => diveId,
            tags: body.tags,
            userId: userid,
            batch,
        });
    }

    if (body.computer_id && body.fingerprint) {

        batch.add(`
           update computers
              set last_fingerprint = $3
                , last_read = $2
            where coalesce('1970-01-01 00:00:00', last_read) < $2
            and computer_id = $1
        `, [
            body.computer_id,
            body.date,
            body.fingerprint,
        ]);
    }

    await batch.execute();

    res.json({
        dive_id: diveId,
        skipped,
    });

});

router.get("/:id/samples", async (req, res) => {

    const samples: QueryResult = await database.call(
        "select samples from dives d where d.user_id = $1 and dive_id=$2",
        [req.user.user_id, req.params.id],
    );

    res.json(
        samples.rows.length ? (samples.rows[0].samples || []) : [],
    );
});

interface IComputerBatch {
    computer_id: number;
    dives: any[];

}

router.post("/batch", async (req, res) => {
    const dat = req.body as IComputerBatch;
    console.log(req.body);

    res.json({
        dive_id: -1,
    });
});
