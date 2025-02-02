[![license](https://img.shields.io/github/license/mashape/apistatus.svg?maxAge=2592000)](https://opensource.org/licenses/MIT)
[![Build Status](https://travis-ci.org/webgme/webgme.svg?branch=master)](https://travis-ci.org/webgme/webgme)
[![Version](https://badge.fury.io/js/webgme.svg)](https://www.npmjs.com/package/webgme)
[![Downloads](http://img.shields.io/npm/dm/webgme.svg?style=flat)](http://img.shields.io/npm/dm/webgme.svg?style=flat)

# WebGME - Web-based Generic Modeling Environment

Create your own Domain Specific Modeling Languages (DSML) right in the browser. Specify modeling concepts, their relationships, attributes, and aspects by drawing a UML class diagram-based metamodel and WebGME automatically configures itself to support the DSML.

WebGME promotes collaboration where each change is translated into a micro-commit broadcast to all connected users. A lightweight branching scheme is transparently supported by the infrastructure. Code generators and externals tools can work on consistent snapshots (specific commits) while users can continue editing the models.

WebGME provides a variety of extension points for you to customize your application. See below for a list and explainations. All these can be neatly generated, shared and imported using a [command line interface](https://github.com/webgme/webgme-cli).

![WebGME-User-Interface](img/UI_2.11.1.png "WebGME UI - try it out at https://webgme.org")

# Getting started

### Dependencies
#### Server
 - [NodeJS](https://nodejs.org/) (version >= 4, CI tests are performed on versions 4.x, 6.x and LTS is recommended).
 - [MongoDB](https://www.mongodb.com/) (version >= 2.6).
 - [Git](https://git-scm.com) (must be available in PATH).
 - [Redis](https://redis.io/) Note that this is only needed if you intend on running [multiple webgme nodes](https://github.com/webgme/webgme/wiki/Multiple-Nodes) behind a reverse proxy.

#### Browser
We aim to support all the major modern browsers. However we recommend using Chrome for two reasons: manual testing is mostly done using chrome and all performance profiling is done against the [V8 JavaScript Engine](https://en.wikipedia.org/wiki/V8_(JavaScript_engine)).

### Using WebGME
You can always try out webgme at our public deployment at [webgme.org](https://webgme.org). After a certain point you probably want to host your own server with custom running code and visualization. At this point follow the instructions at 1.

1. [webgme-cli](https://github.com/webgme/webgme-cli). This is the preferred way of using webgme as it allows you to:
 * Automatically generate boilerplate code for [extension components](#extension-components) (w/o manually configuring paths etc.).
 * Reuse components from other users.
 * Publish and share your work with others.
 * Updating to newer webgme releases only requires a `npm install webgme` and won't cause any conflicts.
 * **Note that** if cloning an existing repository constructed with webgme-cli, it is only neccessary to install webgme-cli if you intend to create/import new components.

2. For webgme developers, clone this repo.
 * install packages with npm `npm install`
 * launch mongod locally
 * start the server `npm start`

After the webgme server is up and there are no error messages in the console. Open a valid webgme address in the browser. The default is `http://127.0.0.1:8888/`, you should see all valid addresses in the console where you started webgme.
To view the available documentation visit `<host>/api`.

# Command line interface

All runnable javascript programs are stored in the `src/bin` directory, you should start them with node from the root directory of the repository, e.g. `node src/bin/start_server.js` starts the web server.
Each script supports the `--help` or `-h` command line parameter, which will list all possible parameters.

* `start_server.js`: it starts a web server, which opens a connection to the configured MongoDB.
* `run_plugin.js`: executes a plugin via a direct MongoDB connection.
* `merge.js`: merges two branches if there are no conflicts.
* `usermanager.js`: manages users, organizations, and project authorization (read, write, delete).
* `clean_up.js`: lists/removes projects based on supplied criteria (commits, branches, regex etc.).
* `export.js`: exports a (snapshot of a) branch into a webgmex-file.
* `import.js`: imports a (snapshot of a) branch (from webgmex-file) into a webgme project.
* `addon_handler.js`: starts a server that handles running addons (see `config.addOn.workerUrl`).
* `manage_webhooks.js`: add/update/remove webhooks to and from projects.
* `blob_fs_clean_up.js`: cleans up blobs from the filesystem that are not referenced from any projects.
* `plugin_hook.js`: plugin developer utility for triggering plugin on changes made to a project.
* `storage_stats.js`: outputs statistics about the projects in the database. 
* `connected_webhook_handler.js`: webhook example illustrating how to create an authenticated remote connection to the storage (models).

# Extension Components
* [Plugins](./src/plugin/README.md) - Model interpretation for e.g. code generation.
* [AddOns](./src/addon/README.md) - Continuous model interpretation for e.g. constraint evaluation.
* [Executor](./src/server/middleware/executor/Readme.md) - Code execution framework.
* [Rest Routers](./src/server/middleware/ExampleRestRouter.js) - Add custom REST API routes.
* [Layouts](./src/plugin/coreplugins/LayoutGenerator/LayoutGenerator.js) - Configure the layout of the generic UI.
* [Visualizers](./src/plugin/coreplugins/VisualizerGenerator/VisualizerGenerator.js) - Add complete visualizers to the generic UI.
* [Decorators](./src/plugin/coreplugins/DecoratorGenerator/DecoratorGenerator.js) - Add custom decoration to the nodes in the model editor.
* [Constraints](./src/plugin/coreplugins/ConstraintEvaluator/ConstraintEvaluator.js) - Add custom constraints based on meta-types.

See [gme-config](./config/README.md) for available configuration parameters.

# Change log
See [CHANGELOG](./CHANGELOG.md)

# Contributing
See [CONTRIBUTING](./CONTRIBUTING.md)

# License
See the [LICENSE](LICENSE) file.
