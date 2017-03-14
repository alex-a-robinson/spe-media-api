"use strict";

var fs = require('fs');
var path = require('path');
var tmp = require('tmp');
var config = require('./config.js');
var express = require('express');
var bodyParser = require('body-parser');
var admin = require('firebase-admin');
var storage = require('@google-cloud/storage');
var app = express();

class Exhibit
{
    constructor(gcs) {
        this.rfid = '';
        this.time = -1;

        this.gcs = gcs;
        this.db = admin.app().database();

        this.bucket = gcs.bucket(config.bucket);
    }

    setLastRfid(rfid) {
        this.rfid = rfid;
        this.time = Date.now();

        var ref = this.db.ref('rfid_scans');

        ref.push({
            rfid: this.rfid,
            timestamp: admin.database.ServerValue.TIMESTAMP,
            scanner_id: config.scanner_id
        }).catch(function(error) {
            console.error('Error writing new rfid scan', error);
        });
    }

    rfidListenLinux() {
        var LinuxInputListener = require('linux-input-device');

        var input = new LinuxInputListener(config.rfid_device);

        var rfidString = '';

        input.on('state',(value, key, kind) => {
            if(value == true && kind == 'EV_KEY') {
                if(key == 28) { // Newline
                    console.log('Read rfid: ' + rfidString);
                    this.setLastRfid(rfidString);
                    rfidString = '';
                } else { // Add to existing string
                    rfidString = rfidString + '1234567890'[key - 2];
                }
            }
        });

        input.on('error', console.error);
    }

    rfidListen() {
        if(process.platform == 'linux') {
            this.rfidListenLinux();
        } else {
            console.error('Unsupported platform: ' + process.platform);
        }
    }

    getUid(rfid) {
        
    }

    apiLastRfid() {
        return {rfid: this.rfid, time: this.time};
    }

    apiUpload(req, res) {
        var o = req.body;

        console.log('Data: ' + o.data);
        console.log('Mime: ' + o.mime);
        console.log('RFID: ' + o.rfid);

        var ref = this.db.ref('rfids/' + o.rfid);
        var uid = '';
        ref.once('value', (snap) => {
            var uid = snap.val().uid;
            console.log('UID: ' + uid);

            var tmpobj = tmp.fileSync({ keep: true });
            console.log('Name: ' + tmpobj.name);
            fs.writeFileSync(tmpobj.name, new Buffer(o.data, 'base64'));

            var name = path.posix.basename(tmpobj.name);

            var ref = this.db.ref('media/' + uid + '/' + o.rfid);
            ref.push({
                file_name: name,
                mime: o.mime
            });

            var opts = {
                destination: 'user-media/' + uid + '/' + o.rfid + '/' + name,
                metadata: {contentType: o.mime}
            };

            this.bucket.upload(tmpobj.name, opts, function(err, file) {
                if(!err) res.json({status: 'OK'});
                else {
                    console.error(err);
                    res.status(500).json({status: 'FAIL'});
                }
            });

            // Upload the thumbnail
           var thumb_opts = {
                destination: 'user-media/' + uid + '/' + o.rfid + '/' + name + '.thumb',
                metadata: {contentType: o.mime}
            };

            this.bucket.upload(tmpobj.name + '.thumb', thumb_opts, function(err, file) {
                if(!err) res.json({status: 'OK'});
                else {
                    console.error(err);
                    res.status(500).json({status: 'FAIL'});
                }
            });
 
            

        });

        return {status: 'OK'};
    }
}

var serviceAccount = require('./serviceAccount.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.database_url
});

var gcs = storage({
  projectId: config.project_id,
  keyFilename: './gcs.json'
});

var ex = new Exhibit(gcs);

//ex.rfidListen();

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});

app.use(bodyParser.json({limit: '100mb'}));

app.get('/api/last_rfid', function(req, res) {
    res.json(ex.apiLastRfid());
});

app.post('/api/upload', ex.apiUpload.bind(ex));

app.listen(8080, function() {
    console.log('Listening on port 8080');
})
