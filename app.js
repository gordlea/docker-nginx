#!/usr/bin/env node

var _ = require("underscore");
var fs = require("fs");
var argv = require('optimist').argv;
var Promise = require("promise");
var sh = require('execSync');


var docker = null;
if (argv.host !== undefined) {
	console.log(argv.host)
	docker = require('docker.io')({ socketPath: false, host: 'http://'+argv.host, port: '4243'});
} else if (arv.socket !== undefined) {
	docker = require('docker.io')({ socketPath: argv.socket });
} else {
	docker = require('docker.io')({ socketPath: '/var/run/docker.sock' });
}
var getDockerDetails = Promise.denodeify(docker.containers.inspect);
var options = {}; // all options listed in the REST documentation for Docker are supported.
var template = fs.readFileSync("nginx_template", 'utf8');
var outputPath = argv.outputPath ? argv.outputPath + '/' : "/etc/nginx/conf.d/"; 
docker.containers.list(options /* optional*/, function(err, containerList) {
    if (err) throw err;
    
    // console.log('Found %d containers, filtering', allContainers.length)
    var containers = _.filter(containerList, function(containerSummary) {
    	console.dir(containerSummary.Ports)
    	return _.some(containerSummary.Ports, function(port) {
    		return port.PrivatePort === 80 && port.PublicPort !== undefined;
    	});
    });
    var promises = []
    _.forEach(containers, function(container) {
    	var p = getDockerDetails(container.Id, function(err, details) {
    		console.log(details);
    		var templateData = {
    			domain: details.Config.Hostname + '.' + details.Config.Domainname,
    			internal_port: details.NetworkSettings.Ports["80/tcp"][0].HostPort
    		}

    		var templateOutput = _.template(template, templateData);
    		fs.writeFileSync(outputPath + details.Config.Hostname + ".conf", templateOutput);
    	});
    	p.then(function() {
    		console.log("done of %s", container.Id)
    	})
    	promises.push(p)
    	
    	
    });
    Promise.all(promises).then(function(res) {

    	console.log("done all");
    	var code = sh.run('service nginx reload');
    	process.exit(0);
    });

});
