(function () {
  "use strict";
  'use strict';


  var app = angular.module('viewCustom', ['angularLoad']);

  app.component('prmLogoAfter',{
    bindings: {parentCtrl: '<'},
    controller: 'prmLogoAfterController',
    template: `<div class="product-logo product-logo-local" layout="row" layout-align="start center" layout-fill id="banner" tabindex="0" role="banner">
    <a href="https://www.plymouth.ac.uk">
    <img class="logo-image" alt="{{(\'nui.header.LogoAlt\' | translate)}}" ng-src="{{ $ctrl.getIconLink() }}"/>
    </a>
    </div>`
  });  

  app.controller('prmLogoAfterController', [function () {
    var vm = this;
    vm.getIconLink = getIconLink;
    function getIconLink() {
      return vm.parentCtrl.iconLink;
    }
  }]);

  app.component('prmMainMenuAfter', {
    bindings: {parentCtrl: '<'},
    controller:"prmMainMenuAfterController",
    template :
    '<div class="top-nav-bar-links-local top-nav-bar-links buttons-group layout-align-center-center layout-row flex-100">' +
      '<a ng-repeat="item in $ctrl.myMenu"' +
      ' href="{{ item.url }}"' +
      ' class="zero-margin flex-button multi-line-button button-over-dark md-button md-primoExplore-theme md-ink-ripple layout-align-center-center layout-column"' +
      ' ng-hide="$ctrl.hideLegantoMenuLink(urlConfig.url,urlConfig.label)"><span class="item-content" translate="mainmenu.label.{{ item.label }}"></span></a>' +
    '</div>'
  });

  app.controller('prmMainMenuAfterController', [function(){
    var mm = this;
    mm.myMenu = myMenu();
    function myMenu() {
      var mainView = mm.parentCtrl.mainView;
      var labels = mm.parentCtrl.menuLabels;
      for (var i = 0; i < mainView.length; i++) {
        labels[mainView[i].label] == null ? mainView[i].label : mainView[i].label = labels[mainView[i].label];
      }
      return mainView;
    }
  }]);  
})();

(function() {
  var x = document.createElement("script"); x.type = "text/javascript"; x.async = true;
  x.src = (document.location.protocol === "https:" ? "https://" : "http://") + "us.refchatter.net/js/libraryh3lp.js?310";
  var y = document.getElementsByTagName("script")[0]; y.parentNode.insertBefore(x, y);
})();

