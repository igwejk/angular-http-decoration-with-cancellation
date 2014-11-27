(function (angular) {
	"use strict";

	/**
	 * `app` usually should be the module defined by your root scope.
	 * @type @exp;angular@call;module
	 */
	var app = angular.module("app", [/* your app dependencies */]);

	app.config(["$provide",
		function ($provide) {
			$provide.decorator("$http", function ($delegate, $q) {

				var request = (function () {
					var baseUrl = "YOUR_BASE_URL";
					var servicesPath = baseUrl + "PATH_TO_SERVICES/";
					var cancellationService = servicesPath + "CANCELLATION_SERVICE_NAME.svc/METHOD_NAME";

					return {
						key: (function () {
							/**
							 * @param {Boolean} s If truthy indicates the middle part is to be generated.
							 * @see http://slavik.meltser.info/?p=142
							 * @returns {String}
							 */
							function _p8(s) {
								var p = (Math.random().toString(16) + "000000000").substr(2, 8);
								return s ? "-" + p.substr(0, 4) + "-" + p.substr(4, 4) : p;
							}
							var localID = 100;
							var sessionID = _p8() + _p8(true) + _p8(true) + _p8().substr(0, 5);

							/**
							 * Request ID generator.
							 * @returns {String} A GUID-format string that serves as a request ID and cancellation token.
							 */
							return function () {
								// maintained at 3 digits.
								localID = ++localID > 999 ? 101 : localID;

								return sessionID + localID;
							};
						}()),
						// Map from request ID to an object that contains a promise that will cancel it on resolution.
						track: {},
						servicesPath: function () {
							return servicesPath;
						},
						cancellationService: function () {
							return cancellationService;
						}
					};
				}());

				var $http = function (config) {

					if (!config || !config.hasOwnProperty("url")) {
						throw new Error("Failed to initiate request: config object is invalid.");
					}

					var cancellation = $q.defer(), id = request.key();
					request.track[id] = {
						cancellation: cancellation
					};

					config.hasOwnProperty("headers") || (config.headers = {});
					config.headers['request-id'] = id;
					config.timeout = cancellation.promise;

					var response = $delegate.call(null, config);
					var conclude = function () {
						request.track.hasOwnProperty(id) && delete request.track[id];
					};

					// Overriding the default response methods.
					var _success = response.success, _error = response.error;
					var _then = response.then, _catch = response.catch, _finally = response.finally;
					response.success = function (fn) {
						return _success.call(response, function () {
							conclude();
							angular.isFunction(fn) && fn.apply(null, arguments);
						});
					};
					response.error = function (fn) {
						return _error.call(response, function () {
							conclude();
							angular.isFunction(fn) && fn.apply(null, arguments);
						});
					};
					response.then = function (successFn, errorFn) {
						return _then.call(response, function () {
							conclude();
							angular.isFunction(successFn) && successFn.apply(null, arguments);
						}, function () {
							conclude();
							angular.isFunction(errorFn) && errorFn.apply(null, arguments);
						});
					};
					response.catch = function (fn) {
						return _catch.call(response, function () {
							conclude();
							angular.isFunction(fn) && fn.apply(null, arguments);
						});
					};
					response.finally = function (fn) {
						return _finally.call(response, function () {
							conclude();
							angular.isFunction(fn) && fn.apply(null, arguments);
						});
					};

					// Adding cancellation interfaces to the response promise.
					response.cancel = function () {
						if (request.track.hasOwnProperty(id)) {
							/*
							 * Because cancellation on server-side may throw,
							 * thus returning a 500 status code, whereas what is
							 * desired is a clean "request cancelled", first
							 * cancel on client-side before sending cancellation request to server.
							 */
							request.track[id].cancellation.resolve("Request was cancelled.");
							delete request.track[id];
							/*
							 * At this point it's fine to message server that the
							 * task with ID, id, should be cancelled. If the server
							 * throws, client won't notice.
							 */
							$delegate.post(request.cancellationService(), {
								taskID: id
							});
						}
					};
					response.cancelAll = function () {
						Object.keys(request.track).forEach(function (id) {
							if (request.track.hasOwnProperty(id)) {
								request.track[id].cancellation.resolve("Request was cancelled.");
								delete request.track[id];
								$delegate.post(request.cancellationService(), {
									taskID: id
								});
							}
						});
					};

					return response;
				};

				// Making default $http properties available.
				Object.keys($delegate).forEach(function (property) {
					angular.isFunction($http[property]) || ($http[property] = $delegate[property]);
				});
				// Implementing short methods
				["delete", "head", "jsonp"].forEach(function (method) {
					$http[name] = function (url, config) {
						return $http(angular.extend(config || {}, {
							method: name,
							url: url
						}));
					};
				});
				["post", "put", "patch"].forEach(function (method) {
					$http[method] = function (url, data, config) {
						return $http(angular.extend(config || {}, {
							method: method,
							url: url,
							data: data
						}));
					};
				});
				$http.get = function (url, config) {
					// Quick and simple check for static html request.
					// Based on heuristics, it's best if requests for templates are
					// not interferred with, they should directly use original implementation.
					var templateRequest = config.url.substring(config.url.lastIndexOf("/") + 1).indexOf(".htm") !== -1;
					return (templateRequest ? $delegate : $http)(angular.extend(config || {}, {
						method: name,
						url: url
					}));
				};

				// Adding a service call convenience method.
				$http.service = function (path, data) {
					var bits = path.trim().split(/\//g);
					if (bits.length < 2 || (bits.length > 2 || (bits[0] === "" || bits[1] === ""))) {
						var eww = "Invalid path. Service path should be in the" +
								" following form: `<SERVICE_NAME>/<METHOD>`";
						throw new Error(eww);
					}
					var url = request.servicesPath + bits[0] + ".svc/" + bits[1];
					return $http.post(url, data);
				};

				return $http;
			});
		}
	]);

	// add your other blocks as required e.g.:
	// app.controller("your_controller, []);
})(angular);