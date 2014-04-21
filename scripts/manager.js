String.prototype.trimLeft = function() {
	return this.replace(/^[w]+/g, '');
};

String.prototype.trim = function() {
	var url = this.trimLeft();
	return url.replace(/^\./g, '');
};
if (!chrome.cookies) {
	chrome.cookies = chrome.experimental.cookies;
}

function Timer() {
	this.start_ = new Date();

	this.elapsed = function() {
		return (new Date()) - this.start_;
	};

	this.reset = function() {
		this.start_ = new Date();
	};
}

function deserialize(object) {
	return typeof object == 'string' ? JSON.parse(object) : object;
}

// Compares cookies for "key" (name, domain, etc.) equality, but not "value" equality.
function cookieMatch(c1, c2) {
	return (c1.name == c2.name) && (c1.domain == c2.domain) && (c1.hostOnly == c2.hostOnly) && (c1.path == c2.path) && (c1.secure == c2.secure) && (c1.httpOnly == c2.httpOnly) && (c1.session == c2.session) && (c1.storeId == c2.storeId);
}

// Returns an array of sorted keys from an associative array.
function sortedKeys(array) {
	var keys = [];
	for (var i in array) {
		keys.push(i);
	}
	keys.sort();
	return keys;
}

// Shorthand for document.querySelector.
function select(selector) {
	return document.querySelector(selector);
}

// An object used for caching data about the browser's cookies, which we update as notifications come in.
function CookieCache() {
	this.cookies_ = {};

	this.reset = function() {
		this.cookies_ = {};
	};

	this.add = function(cookie) {
		var domain = cookie.domain;
		if (!this.cookies_[domain]) {
			this.cookies_[domain] = [];
		}
		this.cookies_[domain].push(cookie);
	};

	this.remove = function(cookie) {
		var domain = cookie.domain;
		if (this.cookies_[domain]) {
			var i = 0;
			while (i < this.cookies_[domain].length) {
				if (cookieMatch(this.cookies_[domain][i], cookie)) {
					this.cookies_[domain].splice(i, 1);
				} else {
					i++;
				}
			}
			if (this.cookies_[domain].length == 0) {
				delete this.cookies_[domain];
			}
		}
	};

	// Returns a sorted list of cookie domains that match |filter|. If |filter| is
	//  null, returns all domains.
	this.getDomains = function(filter) {
		var result = [];
		sortedKeys(this.cookies_).forEach(function(domain) {
			if (!filter || domain.indexOf(filter) != -1) {
				result.push(domain);
			}
		});
		return result;
	};

	this.getCookies = function(domain) {
		return this.cookies_[domain];
	};
}

var cache = new CookieCache();

function removeAllForFilter() {
	var filter = select("#filter").value;
	var timer = new Timer();
	var val = $("#showLess").val();
	if (val == "tracker" || val == "secure" && filter == "") {
		removeFilteredCookies(val);
	} else {
		cache.getDomains(filter).forEach(function(domain) {
			removeCookiesForDomain(domain);
		});
	}
}

function removeAll() {
	var all_cookies = [];
	cache.getDomains().forEach(function(domain) {
		cache.getCookies(domain).forEach(function(cookie) {
			all_cookies.push(cookie);
		});
	});
	cache.reset();
	var count = all_cookies.length;
	var timer = new Timer();
	for (var i = 0; i < count; i++) {
		removeCookie(all_cookies[i]);
	}
	timer.reset();
	chrome.cookies.getAll({}, function(cookies) {
		for (var i in cookies) {
			cache.add(cookies[i]);
			removeCookie(cookies[i]);
		}
	});
}

function removeCookie(cookie) {
	var url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
	chrome.cookies.remove({
		"url" : url,
		"name" : cookie.name
	});
}

function removeCookiesForDomain(domain) {
	var timer = new Timer();
	cache.getCookies(domain).forEach(function(cookie) {
		removeCookie(cookie);
	});

	var val = $("#showLess").val();
	var newVal = getValue();
	(newVal.children.length == 1) ? $("#showLess").val("all") : showCookies(val);

	resetFilter();
}

function removeFilteredCookies(val) {
	var cookie = (val == "tracker") ? trackingCookies : secureCookies;
	cookie.children.forEach(function(item, index, array) {
		for ( i = 0; i < item.children.length; i++) {
			removeCookie(item.children[i]);
		}
	});
	$("#showLess").val("all");
	reloadCookieTable();
	resetFilter();
}

function resetTable() {
	var table = select("#cookies");
	while (table.rows.length > 1) {
		table.deleteRow(table.rows.length - 1);
	}
}

var reload_scheduled = false;

function scheduleReloadCookieTable() {
	if (!reload_scheduled) {
		reload_scheduled = true;
		setTimeout(reloadCookieTable, 250);
		setTimeout(loadVisualization, 250);
	}
}

var yourCookies = {};

function reloadCookieTable() {
	reload_scheduled = false;

	var filter = select("#filter").value;

	var domains = cache.getDomains(filter);
	select("#filter_count").innerText = domains.length;
	select("#total_count").innerText = cache.getDomains().length;

	select("#delete_all_button").innerHTML = "";
	if (domains.length) {
		var button = document.createElement("button");
		button.onclick = removeAllForFilter;
		button.innerText = "delete all " + domains.length;
		select("#delete_all_button").appendChild(button);
	}

	resetTable();

	makeMyCookieObjects();

	var totalCookies = 0;
	for ( i = 0; i < yourCookies.children.length; i++) {
		totalCookies += yourCookies.children[i].children.length;
	}

	select("#cookie_count").innerText = totalCookies;

	var table = select(".scrollContent");

	if ($("#showLess").val() == "all") {
		$("#filter_div").show();
		domains.forEach(function(domain) {
			var cookies = cache.getCookies(domain);
			var row = table.insertRow(-1);
			var domainCell = row.insertCell(-1);
			domainCell.innerText = domain;
			domainCell.setAttribute("width", "200px");
			var cell = row.insertCell(-1);
			cell.innerText = cookies.length;
			cell.setAttribute("class", "cookie_count");

			var button = document.createElement("button");
			button.innerText = "delete";
			button.onclick = ( function(dom) {
					return function() {
						removeCookiesForDomain(dom);
					};
				}(domain));
			var cell = row.insertCell(-1);
			cell.appendChild(button);
			cell.setAttribute("class", "button");
		});
	} else {
		showCookies($("#showLess").val());
	}
}

var blacklist = deserialize(localStorage.blacklist) || {};

function makeMyCookieObjects() {
	var children = [];

	for (var key in cache.cookies_) {
		if (cache.cookies_.hasOwnProperty(key)) {
			children.push(cache.cookies_[key]);
		}
	}

	yourCookies = {
		"name" : "",
		"children" : children
	};

	for ( i = 0; i < yourCookies.children.length; i++) {
		yourCookies.children[i] = {
			"children" : children[i]
		};

		if (yourCookies.children[i].children[0].domain) {
			var names = yourCookies.children[i].children[0].domain.trim();
			yourCookies.children[i].nameTwo = names;
		}

		for ( j = 0; j < yourCookies.children[i].children.length; j++) {
			yourCookies.children[i].children[j].size = getSize(yourCookies.children[i].children[j].expirationDate);
			yourCookies.children[i].children[j].nameTwo = getDate(yourCookies.children[i].children[j].expirationDate);
		}
	}

	trackingCookies = [];
	secureCookies = [];

	yourCookies.children.forEach(function(item, index, array) {
		item.counter = 0;
		item.tracker = isTracker(item.nameTwo);
		if (item.tracker) {
			trackingCookies.push(item);
		}

		item.children.forEach(function(anotherItem, anotherIndex, anotherArray) {
			if (anotherItem.secure && item.counter != 1) {
				secureCookies.push(item);
				item.counter++;
			}
			if (anotherArray.length == 1) {
				anotherItem.tracker = isTracker(item.nameTwo);
			}
		});
	});
}

function isTracker(names) {
	var value = false;
	for ( i = 0; i < blacklist.length; i++) {
		if (names == blacklist[i].domain && value == false) {
			value = true;
		}
	}
	return value;
}

function getDate(epoch) {
	theDate = epoch * 1000;
	var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"], d = new Date(theDate), month = months[d.getUTCMonth()], year = d.getFullYear().toString();

	if (!epoch) {
		return ("Session Cookie");
	} else {
		return (month + " " + year);
	}
}

function getSize(epoch) {
	var size, currentTime = ((new Date).getTime() - (new Date).getMilliseconds()) / 1000;
	var count = epoch - currentTime;

	if (!epoch)
		size = 500;
	else if (count < 200000)
		size = 750;
	else if (count > 199999 && count < 1000000)
		size = 1000;
	else if (count > 999999 && count < 2504000)
		size = 1500;
	else if (count > 2503999 && count < 5000000)
		size = 2000;
	else if (count > 4999999 && count < 15500000)
		size = 2500;
	else if (count > 15499999 && count < 15680200)
		size = 3000;
	else if (count > 15680199 && count < 15800000)
		size = 3500;
	else if (count > 157999999 && count < 30000000)
		size = 4000;
	else if (count > 29999999 && count < 31448000)
		size = 4500;
	else if (count > 31447999 && count < 31448200)
		size = 5000;
	else if (count > 31448199 && count < 35000000)
		size = 5500;
	else if (count > 34999999 && count < 62984100)
		size = 6000;
	else if (count > 62984099 && count < 63000000)
		size = 6500;
	else if (count > 62999999 && count < 157592100)
		size = 7000;
	else if (count > 157592099 && count < 315272200)
		size = 8500;
	else if (count > 315272199 && count < 625000000)
		size = 9000;
	else
		size = 9500;
	return size;
}

function getJsonNoMatterWhat(url, callback) {
	//hack from chrollusion
	jQuery.ajax({
		url : url,
		dataType : "json",
		error : function(xhr, errText, err) {
			var trackers = JSON.parse(xhr.responseText);
			callback(trackers);
		},
		success : function(data, okText, xhr) {
			callback(data);
		}
	});
}

function focusFilter() {
	select("#filter").focus();
}

function resetFilter() {
	var filter = select("#filter");
	filter.focus();
	if (filter.value.length >= 0) {
		filter.value = "";
		reloadCookieTable();
	}
}

var ESCAPE_KEY = 27;
window.onkeydown = function(event) {
	if (event.keyCode == ESCAPE_KEY) {
		resetFilter();
	}
};
function listener(info) {
	cache.remove(info.cookie);
	if (!info.removed) {
		cache.add(info.cookie);
	}
	scheduleReloadCookieTable();
}

function startListening() {
	chrome.cookies.onChanged.addListener(listener);
}

function stopListening() {
	chrome.cookies.onChanged.removeListener(listener);
}

function getValue() {
	var val = $("#showLess").val();
	return val == "tracker" ? trackingCookies : val == "secure" ? secureCookies : yourCookies;
}

function loadVisualization() {
	var $myVis = $('#d3-container');
	$myVis.empty();

	var val = getValue();
	if (val.children.length > 0) {
		var w = 1280, h = 800, r = 720, x = d3.scale.linear().range([0, r]), y = d3.scale.linear().range([0, r]), node, root;

		var pack = d3.layout.pack().size([r, r]).value(function(d) {
			return d.size;
		});
		var vis = d3.select("#d3-container").insert("svg:svg", "h2").attr("width", w).attr("height", h).append("svg:g").attr("transform", "translate(" + (w - r) / 2 + "," + (h - r) / 2 + ")");

		node = root = data = val;

		var nodes = pack.nodes(root);
		vis.selectAll("circle").data(nodes).enter().append("svg:circle").attr("class", function(d) {
			return d.session ? "session" : d.tracker ? "tracker" : d.secure ? "secure" : d.children ? : "parent" : "child";
		}).attr("cx", function(d) {
			return d.x;
		}).attr("cy", function(d) {
			return d.y;
		}).attr("r", function(d) {
			return d.r;
		}).on("click", function(d) {
			return zoom(node == d ? root : d);
		});

		vis.selectAll("text").data(nodes).enter().append("svg:text").attr("class", function(d) {
			return d.children ? "parent" : "child";
		}).attr("x", function(d) {
			return d.x;
		}).attr("y", function(d) {
			return d.y;
		}).attr("dy", ".35em").attr("text-anchor", "middle").style("opacity", function(d) {
			return d.r > 20 ? 1 : 0;
		}).text(function(d) {
			return d.nameTwo ? d.nameTwo : "";
		});

		d3.select(window).on("click", function() {
			zoom(root);
		});

		function zoom(d, i) {
			var k = r / d.r / 2;
			x.domain([d.x - d.r, d.x + d.r]);
			y.domain([d.y - d.r, d.y + d.r]);

			var t = vis.transition().duration(d3.event.altKey ? 7500 : 750);

			t.selectAll("circle").attr("cx", function(d) {
				return x(d.x);
			}).attr("cy", function(d) {
				return y(d.y);
			}).attr("r", function(d) {
				return k * d.r;
			});

			t.selectAll("text").attr("x", function(d) {
				return x(d.x);
			}).attr("y", function(d) {
				return d.children ? y(d.y - 1) : y(d.y - 3);
			}).style("opacity", function(d) {
				return k * d.r > 20 ? 1 : 0;
			});

			node = d;
			d3.event.stopPropagation();
		}
	} else {
		var $container = $('#d3-container');
		var $image = $(document.createElement('img'));
		$image.attr('src', '../img/no-cookies.png').addClass('noCookies').appendTo($container);
	}
}

function onload() {
	focusFilter();
	var timer = new Timer();

	chrome.cookies.getAll({}, function(cookies) {
		startListening();
		start = new Date();
		for (var i in cookies) {
			cache.add(cookies[i]);
		}
		timer.reset();
		getJsonNoMatterWhat("../data/trackers.json", function(trackers) {
			localStorage.blacklist = JSON.stringify(trackers);
		});
		reloadCookieTable();
		loadVisualization();
	});
}

var trackingCookies = [], secureCookies = [];

function formatSecureCookies() {
	secureCookies = {
		"name" : "",
		"children" : secureCookies
	};
	secureCookies.children.forEach(function(item, index, array) {
		for ( i = (item.children.length - 1); i >= 0; i--) {
			if (!item.children[i].secure) {
				item.children.pop(item.children[i]);
			}
		}
	});
}

function formatTrackingCookies() {
	trackingCookies = {
		"name" : "",
		"children" : trackingCookies
	};
}

function showCookies(val) {
	makeMyCookieObjects();

	(val == "tracker" || val == "secure") ? showSome() : showAll();

	function showSome() {
		var cookie = (val == "tracker") ? trackingCookies : secureCookies;

		$("#filter_div").hide();

		reload_scheduled = false;

		select("#filter_count").innerText = cookie.length;
		select("#total_count").innerText = cache.getDomains().length;
		select("#delete_all_button").innerHTML = "";
		if (cookie.length) {
			var button = document.createElement("button");
			button.onclick = removeAllForFilter;
			button.innerText = "delete all " + cookie.length;
			select("#delete_all_button").appendChild(button);
		}
		resetTable();
		var table = select(".scrollContent");
		cookie.forEach(function(item, index, array) {
			var row = table.insertRow(-1);
			var domainCell = row.insertCell(-1);
			domainCell.innerText = item.children[0].domain;
			domainCell.setAttribute("width", "200px");
			var cell = row.insertCell(-1);
			cell.innerText = item.children.length;
			cell.setAttribute("class", "cookie_count");

			var button = document.createElement("button");
			button.innerText = "delete";
			button.onclick = ( function(dom) {
					return function() {
						removeCookiesForDomain(dom);
					};
				}(item.children[0].domain));
			var cell = row.insertCell(-1);
			cell.appendChild(button);
			cell.setAttribute("class", "button");
		});

		var format = (val == "tracker") ? formatTrackingCookies() : formatSecureCookies();
		loadVisualization();
	}

	function showAll() {
		resetFilter();
		loadVisualization();
	}

}

document.addEventListener('DOMContentLoaded', function() {
	onload();
	document.body.addEventListener('click', focusFilter);
	document.querySelector('#remove_button').addEventListener('click', removeAll);
	document.querySelector('#filter_div input').addEventListener('input', reloadCookieTable);
	document.querySelector('#filter_div button').addEventListener('click', resetFilter);
	$("#showLess").change(function() {
		showCookies($(this).val());
	});
});
