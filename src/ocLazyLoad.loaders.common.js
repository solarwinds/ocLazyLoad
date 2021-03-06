(angular => {
    'use strict';

    angular.module('oc.lazyLoad').config($provide => {
        $provide.decorator('$ocLazyLoad', function($delegate, $q, $window, $interval, $templateRequest) {
            var uaCssChecked = false,
                useCssLoadPatch = false,
                anchor = $window.document.getElementsByTagName('head')[0] || $window.document.getElementsByTagName('body')[0];

            /**
             * Load a js/css file
             * @param type
             * @param path
             * @param params
             * @returns promise
             */
            $delegate.buildElement = function buildElement(type, path, params) {
                var deferred = $q.defer(),
                    el,
                    loaded,
                    filesCache = $delegate._getFilesCache(),
                    cacheBuster = function cacheBuster(url) {
                        var dc = new Date().getTime();
                        if(url.indexOf('?') >= 0) {
                            if(url.substring(0, url.length - 1) === '&') {
                                return `${ url }_dc=${ dc }`;
                            }
                            return `${ url }&_dc=${ dc }`;
                        } else {
                            return `${ url }?_dc=${ dc }`;
                        }
                    };

                // Store the promise early so the file load can be detected by other parallel lazy loads
                // (ie: multiple routes on one page) a 'true' value isn't sufficient
                // as it causes false positive load results.
                if(angular.isUndefined(filesCache.get(path))) {
                    filesCache.put(path, deferred.promise);
                }

                var completeHandler = function (script) {
                    loaded = 1;
                    $delegate._broadcast('ocLazyLoad.fileLoaded', path);
                    deferred.resolve(script);
                };

                var errorHandler = function (message, ex) {
                    filesCache.remove(path);
                    if (ex) {
                        message += ` => ${ex.message}`
                    }
                    deferred.reject(new Error(message));
                };

                // Switch in case more content types are added later
                switch(type) {
                    case 'css':
                        el = $window.document.createElement('link');
                        el.type = 'text/css';
                        el.rel = 'stylesheet';
                        el.href = params.cache === false ? cacheBuster(path) : path;
                        break;
                    case 'js':
                        $templateRequest(params.cache === false ? cacheBuster(path) : path)
                            .then((content) => {
                                if (params.debug === true) {
                                    content = 'debugger;\n' + content;
                                }

                                completeHandler(content);
                            })
                            .catch(function (ex) {
                                errorHandler(`Unable to load script ${path}.`, ex);
                            });
                        break;
                    default:
                        errorHandler(`Requested type "${ type }" is not known. Could not inject "${ path }"`);
                        break;
                }
                if (el) {
                    el.onload = el['onreadystatechange'] = function (e) {
                        if ((el['readyState'] && !/^c|loade/.test(el['readyState'])) || loaded) return;
                        el.onload = el['onreadystatechange'] = null;
                        completeHandler(el);
                    };
                    el.onerror = function () {
                        errorHandler(`Unable to load ${ path }`);
                    };
                    el.async = params.serie ? 0 : 1;

                    var insertBeforeElem = anchor.lastChild;
                    if (params.insertBefore) {
                        var element = angular.element(angular.isDefined(window.jQuery) ? params.insertBefore : document.querySelector(params.insertBefore));
                        if (element && element.length > 0) {
                            insertBeforeElem = element[0];
                        }
                    }
                    insertBeforeElem.parentNode.insertBefore(el, insertBeforeElem);
                }

                /*
                 The event load or readystatechange doesn't fire in:
                 - PhantomJS 1.9 (headless webkit browser)
                 - iOS < 6       (default mobile browser)
                 - Android < 4.4 (default mobile browser)
                 - Safari < 6    (desktop browser)
                 */
                if(type == 'css') {
                    if(!uaCssChecked) {
                        var ua = $window.navigator.userAgent.toLowerCase();

                        if (ua.indexOf('phantomjs/1.9') > -1) {
                            // PhantomJS ~1.9
                            useCssLoadPatch = true;
                        } else if (/iP(hone|od|ad)/.test($window.navigator.platform)) {
                            // iOS < 6
                            var v = $window.navigator.appVersion.match(/OS (\d+)_(\d+)_?(\d+)?/);
                            var iOSVersion = parseFloat([parseInt(v[1], 10), parseInt(v[2], 10), parseInt(v[3] || 0, 10)].join('.'));
                            useCssLoadPatch = iOSVersion < 6;
                        } else if (ua.indexOf('android') > -1) {
                            // Android < 4.4
                            var androidVersion = parseFloat(ua.slice(ua.indexOf('android') + 8));
                            useCssLoadPatch = androidVersion < 4.4;
                        } else if (ua.indexOf('safari') > -1) {
                            // Safari < 6
                            var versionMatch = ua.match(/version\/([\.\d]+)/i);
                            useCssLoadPatch = (versionMatch && versionMatch[1] && parseFloat(versionMatch[1]) < 6);
                        }
                    }

                    if(useCssLoadPatch) {
                        var tries = 1000; // * 20 = 20000 miliseconds
                        var interval = $interval(() => {
                            try {
                                el.sheet.cssRules;
                                $interval.cancel(interval);
                                el.onload();
                            } catch(e) {
                                if(--tries <= 0) {
                                    el.onerror();
                                }
                            }
                        }, 20);
                    }
                }

                return deferred.promise;
            };

            return $delegate;
        })
    });

})(angular);
