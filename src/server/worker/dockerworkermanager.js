/*globals*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

var Docker = require('dockerode'),
    docker = new Docker(),
    params = {
        projectId: 'guest+project',
        commitHash: '#112434',
        selectedObjects: ['/2/3', '/2/4'],
        webgmeToken: 'fsdfasfsadfsadf',
        webgmeUrl: null
    },
    network = docker.getNetwork('bridge'),
    container;

network.inspect()
    .then(function (networkInfo){
        console.log(networkInfo.IPAM.Config[0].Gateway);
        params.webgmeUrl = 'http://' + networkInfo.IPAM.Config[0].Gateway + ':8888';
        return docker.createContainer({
            Image: 'hello-world',
            name: 'test',
            Cmd: ['node', 'script.js', JSON.stringify(params)]
        });
    })
    .then(function(container_) {
        container = container_;
        return container.start();
    })
    .then(function () {
        return container.wait();
    })
    .then(function (res) {
        console.log(res);
        //return container.remove();
    })
    .catch(function (err) {
        console.log(err);
    });