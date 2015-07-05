#!/usr/bin/env node

'use strict';

var fs     = require('fs'),
	util   = require('util'),
    exec   = require('child_process').exec,
	tRy    = require('./lib/tRy'),
	getopt = require('./lib/getopt'),
    maskTransform;


maskTransform = {
	source: 'source',
	destination: 'destination',
	viewBox: [],
	svgs: [],
	done: [],
	line: function(row) {
		var e = {};

		e.x1 = Number(row.replace(/.*x1="([^"]*)".*/i, '$1').trim()) / this.viewBox[0];
		e.y1 = Number(row.replace(/.*y1="([^"]*)".*/i, '$1').trim()) / this.viewBox[1];
		e.x2 = Number(row.replace(/.*x2="([^"]*)".*/i, '$1').trim()) / this.viewBox[0];
		e.y2 = Number(row.replace(/.*y2="([^"]*)".*/i, '$1').trim()) / this.viewBox[1];

		row = row.replace(/x1="([^"]*)"/, 'x1="'+e.x1+'"');
		row = row.replace(/y1="([^"]*)"/, 'y1="'+e.y1+'"');
		row = row.replace(/x2="([^"]*)"/, 'x2="'+e.x2+'"');
		row = row.replace(/y2="([^"]*)"/, 'y2="'+e.y2+'"');
		return row;
	},
	rect: function(row) {
		var e = {};

		e.x = Number(row.replace(/.*x="([^"]*)".*/i, '$1').trim()) / this.viewBox[0];
		e.y = Number(row.replace(/.*y="([^"]*)".*/i, '$1').trim()) / this.viewBox[1];
		e.width = Number(row.replace(/.*width="([^"]*)".*/i, '$1').trim()) / this.viewBox[0];
		e.height = Number(row.replace(/.*height="([^"]*)".*/i, '$1').trim()) / this.viewBox[1];

		row = row.replace(/x="([^"]*)"/, 'x="'+e.x+'"');
		row = row.replace(/y="([^"]*)"/, 'y="'+e.y+'"');
		row = row.replace(/width="([^"]*)"/, 'width="'+e.width+'"');
		row = row.replace(/height="([^"]*)"/, 'height="'+e.height+'"');
		return row;
	},
	circle: function(row) {
		var e = {};

		e.cx = Number(row.replace(/.*cx="([^"]*)".*/i, '$1').trim()) / this.viewBox[0];
		e.cy = Number(row.replace(/.*cy="([^"]*)".*/i, '$1').trim()) / this.viewBox[1];
		e.r = Number(row.replace(/.*r="([^"]*)".*/i, '$1').trim()) / this.viewBox[0];

		row = row.replace(/cx="([^"]*)"/, 'cx="'+e.cx+'"');
		row = row.replace(/cy="([^"]*)"/, 'cy="'+e.cy+'"');
		row = row.replace(/r="([^"]*)"/, 'r="'+e.r+'"');
		return row;
	},
	ellipse: function(row) {
		var e = {};

		e.cx = Number(row.replace(/.*cx="([^"]*)".*/i, '$1').trim()) / this.viewBox[0];
		e.cy = Number(row.replace(/.*cy="([^"]*)".*/i, '$1').trim()) / this.viewBox[1];
		e.rx = Number(row.replace(/.*rx="([^"]*)".*/i, '$1').trim()) / this.viewBox[0];
		e.ry = Number(row.replace(/.*ry="([^"]*)".*/i, '$1').trim()) / this.viewBox[1];

		row = row.replace(/cx="([^"]*)"/, 'cx="'+e.cx+'"');
		row = row.replace(/cy="([^"]*)"/, 'cy="'+e.cy+'"');
		row = row.replace(/rx="([^"]*)"/, 'rx="'+e.rx+'"');
		row = row.replace(/ry="([^"]*)"/, 'ry="'+e.ry+'"');
		return row;
	},
	polygon: function(row) {
		var data, output;

		output = [];
		data = row.replace(/.*points="([^"]*)".*/i, '$1').trim();
		data = data.split(' ');
		for (var i=-1,l=data.length;++i<l;) {
			var d = data[i].trim().split(',');
			output.push((Number(d[0]) / this.viewBox[0]) + ',' + (Number(d[1]) / this.viewBox[1]));
		}//end for
		data = output.join(' ');

		return row.replace(/points="([^"]*)"/, 'points="'+data+'"');
	},
	path: function(row) {
		var dataSet, final, m;

		m = this;
		final = [];
		dataSet = row.replace(/.*d="([^"]*)".*/i, '$1');
		dataSet = dataSet.replace(/z\s*/gi, 'z');
		dataSet.split('z').forEach(
			function(data, idx) {
				var output = [], flag = 0, neoData = [];

				if (!data) return;

				data += 'z';

				for (var i=-1,l=data.length;++i<l;) {
					var c = data.charAt(i), str;
					if (/[a-z]/i.test(c)) {
						if (i) output.push(data.slice(flag, i));
						flag = i;
					}//en if
				}//end for

				for (var i=-1,l=output.length;++i<l;) {
					var d, v, mode, tmp, sign, str;
					d = output[i];
					mode = d.charAt(0);
					v = d.slice((d.length-1)*-1);

					//sign
					sign = '';
					if (v.charAt(0) == '-') {
						sign = '-';
						v = v.slice((v.length-1)*-1);
					}//end if

					if (/v|h/i.test(mode)) {
						//v, h
						neoData.push(mode+sign+(Number(v)/((/h/i.test(mode)) ? m.viewBox[0] : m.viewBox[1])));
					} else {
						tmp = v.replace(/-/g, ',');
						tmp = tmp.split(',');
						str = '';
						for (var j=-1,l2=tmp.length;++j<l2;) {
							var s = tmp[j], divide;

							divide = v.indexOf(s);
							divide = (!divide) ? '' : v.charAt(divide-1);
							v = v.replace(s, '');
							str += divide + Number(s) / ((j % 2) ? m.viewBox[1] : m.viewBox[0]);
						}//end for
						neoData.push(mode+sign+str);
					}//end if
				}//end for
				final.push(neoData.join('') + 'z');
			}
		);
		dataSet = final.join(' ');

		return row.replace(/\sd="([^"]*)"/, ' d="'+dataSet+'"');;
	},
	tenuto: function() {
		var svg, head, m, output, mask, original, defs, fileName, e;

		m = this;
		if (!this.svgs.length) {
			e = {};
			e.infoAll = [];
			e.info = 'All ' + tRy.color('masked', 36) + ' SVGs have been transformed.';
			e.max = tRy.stripColor(e.info).length;
			e.dividingLine = '';
			for (var i=-1,l=e.max;++i<l;) e.dividingLine += '-';

			this.done.forEach(
				function(value, idx) {
					m.done[idx] = (idx + 1) + '. ' + value;
				}
			);

			e.infoAll.push(e.info);
			e.infoAll.push(e.dividingLine);
			e.infoAll = e.infoAll.concat(this.done);
			e.infoAll.push(e.dividingLine);
			e.infoAll.push('Thank you for using ' + tRy.color('maskTransform.js', 32) + ' !');
			
			console.log(e.infoAll.join('\n'));
			return;
		}//end if

		svg = this.svgs.shift();
		fileName = svg;
		svg = util.format('%s/%s', this.source, svg);
		svg = fs.readFileSync(svg, {encoding: 'utf8'});

		svg = svg.replace(/<!--[\s\S]*-->/gm, '');
		svg = svg.replace(/<!DOCTYPE.*>/gim, '');
		svg = svg.replace(/^\s*(.*)/gim, '$1');
		svg = svg.replace(/\r|\n/g, '');
		svg = svg.replace(/>/g, '>\n');

		head = svg.match(/<svg.*>/gim)[0];
		head = head.replace(/.*viewBox="([^"]*)".*/, '$1');

		svg = svg.replace(/^<\?xml.*\?>/gi, '');
		defs = (/<defs>/i.test(svg)) ? svg.match(/<defs>[\s\S]*defs>/gim)[0] : '';
		svg = svg.replace(/<defs>[\s\S]*defs>/gim, '');
		svg = svg.replace(/<\/?g.*>/gi, ''); //remove g
		svg = svg.replace(/<\/?svg.*>/gi, '');// remove <svg>
		svg = svg.replace(/^\s*/gim, '');

		//output
		output = [];
		output.push('<?xml version="1.0" encoding="utf-8"?>');
		output.push('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="' + head + '" width="100%" height="100%">');

		//viewBox
		this.viewBox = [];
		head = head.split(' ').slice(2);
		head.forEach(
			function(value, idx) {
				m.viewBox.push(Number(value));
			}
		);

		//row
		original = [];
		mask = [];
		mask.push('<mask id="mask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="0" y="0" width="100%" height="100%">');
		svg.split('\n').forEach(
			function(row, idx) {
				var mode;
				if (!row) return;
				original.push(row);
				if (row.match(/fill="([^"]*)"/) && /none/i.test(row.match(/fill="([^"]*)"/)[1])) return;

				mode = row.replace(/<([^\s]*)\s.*/, '$1');
				mask.push(m[mode](row));
			}
		);
		mask.push('</mask>');
		defs = (defs) ? defs.replace(/<\/defs>/, '\n' + mask.join('\n') + '\n</defs>') : '<defs>\n'+mask.join('\n')+'\n</defs>';
		output.push(defs);
		output.push(svg+'</svg>');

		//file write
		this.done.push(fileName);
		fs.writeFileSync(util.format('%s/%s', this.destination, fileName), output.join('\n'), {encoding: 'utf8'});

		this.tenuto();
	},
	init: function() {
		var opts, e, m;

		m = this;
		opts = getopt.script('node maskTransform.js')
				.options(
					{
						source: {
							abbr: 's',
							default: 'source',
							help: 'set path for svg source, ex: ./source'
						},
						destination: {
							abbr: 'd',
							default: 'destination',
							help: 'set path for transformed svg, ex: ./destination'
						}
					}
				)
				.parse();
		
		e = ['source', 'destination'];
		for (var i=-1,l=e.length;++i<l;) if (opts[e[i]]) this[e[i]] = opts[e[i]];

		//mkdir
		if (!fs.existsSync(this.source)) fs.mkdirSync(this.source);
		if (!fs.existsSync(this.destination)) fs.mkdirSync(this.destination);

		//unlink exist svg
		fs.readdirSync(this.destination).forEach(
			function(svg) {
				var path = util.format('%s/%s', m.destination, svg);
		        if (fs.lstatSync(path).isDirectory() || !fs.existsSync(path)) return;
		        fs.unlinkSync(path);
			}
		);

		//get source
		fs.readdirSync(this.source).forEach(
			function(svg) {
				if (!(/.*\.svg$/i.test(svg))) return;
				m.svgs.push(svg);
			}
		);

		this.tenuto();
	}
};

maskTransform.init();
