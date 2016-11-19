"use strict";

var admin = require('firebase-admin');
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require('fs'));
var config = require('./config.js');

class Exhibit
{
    constructor(mediaPath)
    {
        this.mediaPath = mediaPath;
    }

    readMediaFile()
    {
        return fs.readFileAsync(this.mediaPath);
    }

    setMediaData(media)
    {
        this.media = media;
    }

    getRFIDScanLinux()
    {
        // Do this here as this works on Linux only!
        var InputEvent = require('input-event');
        var dev = new InputEvent(config.rfid_device);
        var rfidString = '';

        return new Promise((resolve, reject) =>
        {
            dev.on('keydown', ev =>
            {
                if(ev.code < 2 || ev.code > 11)
                    reject(new Error('Unexpected keycode (non numeric)'));

                var c = '1234567890'[code - 2];
                rfidString = rfidString + c;

                if(rfidString.length === 10)
                {
                    this.rfid = rfidString;
                    resolve(rfidString);
                }
            });
        });
    }

    getRFIDScan()
    {
        if(process.platform === 'linux')
            return this.getRFIDScanLinux();
        else
            return Promise.reject('Unexpected platform, linux supported');
    }

    logScan()
    {
        var db = admin.app().database();
        var scans = db.ref('spe-elabs/scans');

        scans.push(
        {
            rfid: this.rfid,
            timestamp: db.ServerValue.TIMESTAMP,
            ex: config.exid
        });
    }

    mediaUpload()
    {

    }
}

function main(args)
{
    if(args.length < 3)
    {
        console.error('Must get media file path as argument');
        process.exit(1);
    }

    var mediaPath = args[2];

    admin.initializeApp(
    {
        credential: admin.credential.cert({
            projectId: config.firebase.projectId,
            clientEmail: config.firebase.clientEmail,
            privateKey: config.firebase.privateKey
        }),
        databaseURL: config.firebase.databaseURL
    });

    let ex = new Exhibit(mediaPath);
    ex.readMediaFile().bind(ex)
        .catch(e => 
        {
            console.error('Error reading media file');
            console.error(e);
            process.exit(2);
        })
        .then(ex.setMediaData)
        .then(ex.getRFIDScan)
        .catch(e => 
        {
            console.error('Error reading RFID tag');
            console.error(e);
            process.exit(3);
        })
        .timeout(config.timeout)
        .catch(e => 
        {
            console.error('Timeout reading RFID tag');
            console.error(e);
            process.exit(4);
        })
        .then(ex.logScan)
        .then(ex.mediaUpload);
}

main(process.argv);