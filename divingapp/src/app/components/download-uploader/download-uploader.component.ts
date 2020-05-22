import { Component, OnInit } from '@angular/core';
import { MiscService } from 'app/services/misc.service';
import {
    BrowserDetectorService,
    OS,
} from 'app/services/browser-detector.service';

interface Platform {
    OS: OS;
    OSName: string;
    icon: string;
    isActive: boolean;
}

@Component({
    selector: 'app-download-uploader',
    templateUrl: './download-uploader.component.html',
    styleUrls: ['./download-uploader.component.scss'],
})
export class DownloadUploaderComponent {
    public platforms: Platform[];

    constructor(
        public browserService: BrowserDetectorService,
        protected miscService: MiscService,
    ) {
        this.platforms = [
            {
                OS: OS.Linux,
                OSName: 'Linux',
                icon: 'fa fa-linux',
                isActive: browserService.isLinux,
            },
            {
                OS: OS.Window,
                OSName: 'Windows',
                icon: 'fa fa-windows',
                isActive: browserService.isWindows,
            },
        ];

        this.platforms.sort((a, b) => {
            return +b.isActive - +a.isActive;
        });
    }

    public async download(os: OS) {
        this.miscService.getUploader(os);
    }
}
