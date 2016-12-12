var config = {};

config.rfid_device = '/dev/input/event0'
config.timeout = 10000;

config.database_url = 'https://spe-elabs.firebaseio.com';

config.project_id = 'spe-elabs';
config.bucket = 'spe-elabs.appspot.com';

config.scanner_id = 9001;

module.exports = config;