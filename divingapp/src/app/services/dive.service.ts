import { AuthService } from './auth.service';
import {Headers, Http,  Response} from '@angular/http';
import { Dive, IBuddy, IDbDive, IDiveRecordDC, IDiveTag, IPlace, TSample } from '../shared/dive';
import { serviceUrl } from '../shared/config';
import { Injectable } from '@angular/core';
import 'rxjs/add/operator/toPromise';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/map';
import { BehaviorSubject } from 'rxjs/Rx';

interface ICountry {
    code: string;
    description: string;
};

@Injectable()
export class DiveStore  {

    private __countries: ICountry[];
    private headers: Headers;
    private get httpOptions() {
        return {
            headers: this.headers,
        };
    }

    constructor(
        private http: Http,
        private auth: AuthService,
    ) {
        this.headers = new Headers();
        this.headers.append('Authorization', 'Bearer ' + this.auth.token);
        this.getCountries();
    }

    get countries() {
        return Observable.fromPromise(this.getCountries());
    }

    getDives(): Observable<Dive[]> {
        return this.http.get(
                `${serviceUrl}/dive/`,
                this.httpOptions,
            ).map(
                (res: Response): Dive[] => {
                    const dives: IDbDive[] = res.json() || [];
                    return Dive.ParseAll(dives);
                }
            ).catch(this.handleError);
    }

    async getCountries(): Promise<ICountry[]> {
        if (this.__countries) {
            return this.__countries;
        }

        let res: Response;
        try {
            res = await this.http.get(
                `${serviceUrl}/country/`,
                this.httpOptions,
            ).toPromise();
        } catch (e) {
            this.handleError(e);
            return;
        }

        const all: { iso2: string, name: string }[] = res.json() || [];
        this.__countries = all.map(
            (c) => { return { code: c.iso2, description: c.name }; }
        );

        return this.__countries;
    }

    async getDiveSpots(c: string): Promise<IPlace[]> {
        const res = await this.http.get(
            `${serviceUrl}/place/${c}`,
            this.httpOptions,
        ).toPromise();
        const all: IPlace[] = res.json() || [];
        return all;
    }

    async saveDive(dive: IDbDive, dive_id?: number): Promise<any> {
        if (dive_id !== undefined) {
            return this.http.put(
                `${serviceUrl}/dive/${dive_id}/`,
                this.httpOptions,
                dive
            ).toPromise();
        } else {
            return this.http.post(
                `${serviceUrl}/dive/`,
                this.httpOptions,
                dive
            ).toPromise();
        }

    }

    async getBuddies(): Promise<IBuddy[]> {
        const req = await this.http.get(
            `${serviceUrl}/buddy/`,
            this.httpOptions,
        ).toPromise();
        return req.json() as IBuddy[];
    }

    async getTags(): Promise<IDiveTag[]> {
        const req = await this.http.get(
            `${serviceUrl}/tag/`,
            this.httpOptions,
        ).toPromise();
        return req.json();
    }

    async getDive(dive_id: number): Promise<Dive|undefined> {

        const res = await this.http.get(
            `${serviceUrl}/dive/${dive_id}/`,
            this.httpOptions,
        ).toPromise();

        const r = res.json();
        return Dive.Parse(r);

    }

    async getSamples(dive_id: number): Promise<TSample[]|undefined> {

        const resp = await this.http.get(
                `${serviceUrl}/dive/${dive_id}/samples/`,
                this.httpOptions,
            ).toPromise();
        return resp.json() as TSample[];

    }

    private handleError(error: Response|any) {
        let errMsg: string;
        if (error instanceof Response) {
            if (error.status === 401) {
                this.auth.logout();
                return;
            }
            const body = error.json() || '';
            const err = body.error || JSON.stringify(body);
            errMsg = `${error.status} - ${error.statusText || ''} ${err}`;
        } else {
            errMsg = error.message ? error.message : error.toString();
        }
        console.error(errMsg);
        return Observable.throw(errMsg);
    }
}
