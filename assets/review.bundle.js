/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./src/Review.js":
/*!***********************!*\
  !*** ./src/Review.js ***!
  \***********************/
/***/ (() => {

eval("document.addEventListener(\"DOMContentLoaded\", function () {\n  var buttonCreateReview = document.getElementById('button-add-review');\n  if (!buttonCreateReview) return;\n  buttonCreateReview.addEventListener('click', function () {\n    var buttonSubmitReview = document.querySelector('form .jdgm-submit-rev');\n    if (buttonSubmitReview) {\n      buttonSubmitReview.addEventListener('click', function (e) {\n        var requiredInputs = document.querySelectorAll('[aria-required=\"true\"]');\n        var scoreInput = document.querySelector('[name=\"score\"]');\n        var allFilled = true;\n        requiredInputs.forEach(function (input) {\n          input.classList.remove('input-error');\n          if (!input.value.trim()) {\n            allFilled = false;\n          }\n        });\n        if (!scoreInput || !scoreInput.value.trim()) {\n          allFilled = false;\n        }\n        if (allFilled) {\n          buttonSubmitReview.style.pointerEvents = 'none';\n          buttonSubmitReview.value = 'Submitting...';\n          setTimeout(function () {\n            buttonSubmitReview.value = 'Submitted!';\n          }, 1000);\n          setTimeout(function () {\n            window.location.reload();\n          }, 1400);\n        }\n      });\n    }\n  });\n});\n\n//# sourceURL=webpack://nautica/./src/Review.js?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./src/Review.js"]();
/******/ 	
/******/ })()
;