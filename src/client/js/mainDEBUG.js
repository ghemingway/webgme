/*globals require*/
/*jshint browser:true, camelcase:false*/
/**
 * Debug version of main.js - it does not use the webgme.dist nor minified versions.
 * N.B. This and main.js should only differ w.r.t. using minified versions or not and
 * if text mapped and what files are required at start.
 * @author pmeijer / https://github.com/pmeijer
 */


var DEBUG = false,
    WebGMEGlobal = WebGMEGlobal || {};

WebGMEGlobal.version = 'DEBUG';
WebGMEGlobal.SUPPORTS_TOUCH = 'ontouchstart' in window || navigator.msMaxTouchPoints;


// configure require path and modules
require.config({
    baseUrl: './',
    paths: {
        css: 'bower_components/require-css/css',
        text: 'lib/require/require-text/text',

        //jQuery and stuff
        jquery: 'bower_components/jquery/dist/jquery',
        'jquery-ui': 'bower_components/jquery-ui/jquery-ui',
        'jquery-ui-iPad': 'lib/jquery/jquery.ui.ipad',
        'jquery-dataTables': 'lib/jquery/jquery.dataTables',
        'jquery-dataTables-bootstrapped': 'lib/jquery/jquery.dataTables.bootstrapped',
        'jquery-spectrum': 'bower_components/spectrum/spectrum',
        'jquery-fancytree': 'bower_components/jquery.fancytree/dist/jquery.fancytree-all',
        'jquery-layout': 'lib/jquery/jquery.layout',

        'jquery-contextMenu': 'bower_components/jQuery-contextMenu/dist/jquery.contextMenu',
        'jquery-csszoom': 'bower_components/jquery.csszoom/jquery.csszoom',

        //Bootstrap stuff
        bootstrap: 'bower_components/bootstrap/dist/js/bootstrap',
        'bootstrap-multiselect': 'bower_components/bootstrap-multiselect/dist/js/bootstrap-multiselect',
        'bootstrap-notify': 'bower_components/remarkable-bootstrap-notify/dist/bootstrap-notify',

        //Other modules
        AutoRouterActionApplier: 'lib/autorouter/action-applier',
        underscore: 'bower_components/underscore/underscore',
        chance: 'bower_components/chance/chance',
        backbone: 'bower_components/backbone/backbone',
        d3: 'bower_components/d3/d3',
        epiceditor: 'bower_components/EpicEditor/epiceditor/js/epiceditor',
        ravenjs: 'bower_components/raven-js/dist/raven',
        clipboard: 'bower_components/clipboard/dist/clipboard.min',

        //RaphaelJS family
        eve: 'lib/raphael/eve',   //needed because of raphael.core.js uses require with 'eve'
        raphaeljs: 'lib/raphael/raphael.amd',
        raphael_core: 'lib/raphael/raphael.core',
        raphael_svg: 'lib/raphael/raphael.svg_fixed',
        raphael_vml: 'lib/raphael/raphael.vml',

        //WebGME custom modules
        common: '/common',
        blob: '/common/blob',
        executor: '/common/executor',
        plugin: '/plugin',
        layout: '/layout',
        panel: '/panel',

        //node_modules
        jszip: 'bower_components/jszip/dist/jszip',
        superagent: 'lib/superagent/superagent',
        debug: 'lib/debug/debug',
        q: 'bower_components/q/q',

        //codemirror: 'bower_components/codemirror/',

        moment: 'bower_components/moment/moment',
        blockies: 'lib/blockies/blockies',

        urlparse: 'lib/purl/purl.min',

        // Angular and modules
        angular: 'bower_components/angular/angular',
        'angular-ui-bootstrap': 'bower_components/angular-bootstrap/ui-bootstrap-tpls',
        'isis-ui-components': 'bower_components/isis-ui-components/dist/isis-ui-components',
        'isis-ui-components-templates': 'bower_components/isis-ui-components/dist/isis-ui-components-templates',
    },
    packages: [{
        name: 'codemirror',
        location: 'bower_components/codemirror',
        main: 'lib/codemirror'
    }],
    shim: {
        'angular-ui-bootstrap': ['angular'],
        'isis-ui-components': ['angular'],
        'isis-ui-components-templates': ['angular'],

        'jquery-ui': ['jquery'],
        'jquery-ui-iPad': ['jquery', 'jquery-ui'],
        'jquery-layout': ['jquery', 'jquery-ui'],

        ravenjs: ['jquery'],
        bootstrap: ['jquery'],
        'bootstrap-multiselect': ['jquery', 'bootstrap'],
        'bootstrap-notify': ['jquery', 'bootstrap'],

        backbone: ['underscore'],
        'js/util': ['jquery'],
        'js/jquery.WebGME': ['bootstrap'],
        'jquery-dataTables': ['jquery'],
        'jquery-dataTables-bootstrapped': ['jquery-dataTables'],
        'js/WebGME': ['js/jquery.WebGME'],
        'jquery-csszoom': ['jquery-ui'],
        'jquery-spectrum': ['jquery'],
        'jquery-fancytree': ['jquery-ui'],
        raphael_svg: ['raphael_core'],
        raphael_vml: ['raphael_core']
    }
});

require([
    'css!/css/main.css',
], function () {
    'use strict';

    require([
        '/js/start.js'
    ], function () {

    });
});