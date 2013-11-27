#!/usr/bin/env node

var _ = require("underscore");
var fs = require("fs");
var argv = require('optimist').argv;
var Promise = require("promise");
var sh = require('execSync');

if (argv.help !== undefined) {
    var help = fs.readFileSync(__dirname + "/help.txt", 'utf8');
    console.log(help);
    return;
}
console.dir(argv);

var docker = null;
if (argv.host !== undefined) {
	docker = require('docker.io')({ socketPath: false, host: 'http://'+argv.host, port: '4243'});
} else if (argv.socket !== undefined) {
	docker = require('docker.io')({ socketPath: argv.socket });
} else {
	docker = require('docker.io')({ socketPath: '/var/run/docker.sock' });
}
var getDockerDetails = Promise.denodeify(docker.containers.inspect);
var options = {}; // all options listed in the REST documentation for Docker are supported.
var templatePath = __dirname + "/nginx_template";
var template = fs.readFileSync(templatePath, 'utf8');
var outputPath = argv.outputPath !== undefined ? argv.outputPath + '/' : "/etc/nginx/conf.d/"; 

docker.containers.list(options /* optional*/, function(err, containerList) {
    if (err) throw err;
    
    // console.log('Found %d containers, filtering', allContainers.length)
    var containers = _.filter(containerList, function(containerSummary) {
        var containerId = fmtContainerId(containerSummary.Id);
        console.log("checking container %s", containerId);

    	var result = _.some(containerSummary.Ports, function(port) {
            console.log("   has PrivatePort 80: %s", port.PrivatePort === 80);
            console.log("   has PrivatePort 28778: %s", port.PrivatePort === 80);
            console.log("   has PublicPort != undefined: %s", port.PublicPort !== undefined);
    		return port.PrivatePort === 80 && port.PublicPort !== undefined;
    	});
        console.log("container %s will be configured: %s", containerId, result);
        return result;

    });
    _.forEach(containers, function(container) {
    	docker.containers.inspect(container.Id, function(err, details) {
            // console.dir(details);
            var logio_port = details.NetworkSettings.Ports["28778/tcp"];
            var logio_port_number = false;
            if (logio_port !== undefined && logio_port !== null) {
                logio_port_number = logio_port[0].HostPort;
            }
    		var templateData = {
    			domain: details.Config.Hostname + '.' + details.Config.Domainname,
    			internal_port: details.NetworkSettings.Ports["80/tcp"][0].HostPort,
                logio_port: logio_port_number 
    		}

    		var templateOutput = _.template(template, templateData);
    		fs.writeFileSync(outputPath + details.Config.Hostname + ".conf", templateOutput);
            console.log("wrote %s for container %s", outputPath + details.Config.Hostname + ".conf", fmtContainerId(container.Id));
            var code = sh.run('service nginx reload');
            console.log("reloaded nginx config, returned %s", code);
    	});

    	
    	
    });

});

function fmtContainerId(containerId) {
    return containerId.substr(0,12);
}
