/*jslint devel:true bitwise:true */
/*global io, socket, WebSocket, Blob, URL, FileReader, DataView, Uint8Array, module, Uint32Array, ArrayBuffer, escape */

(function () {
	"use strict";
	
	var metabinary = {};
	
	/**
	 * arrayBufferをStringに変換して返す
	 * @method arrayBufferToString
	 * @param {ArrayBuffer} arraybuf arrayBuffer
	 * @return URLデコードした文字列
	 */
	function arrayBufferToString(arraybuf) {
		var chars = new Uint8Array(arraybuf),
			encodedString = "",
			decodedString = "",
			i;
		for (i = 0; i < chars.length; i = i + 1) {
			encodedString = encodedString + String.fromCharCode(chars[i]);
		}
		try {
			decodedString = decodeURIComponent(escape(encodedString));
		} catch (e) {
			decodedString = decodeURIComponent(encodedString);
		}
		return decodedString;
	}
	
	//
	// String To ArrayBuffer funciton
	//
	// quate: http://jsperf.com/test-unicode-to-utf8
	//
	/**
	 * UTF8文字列をArrayBufferに変換して返す
	 * @method utf8StringToArray
	 * @param {String} str UTF8文字列
	 * @return ArrayBuffer
	 */
	function utf8StringToArray(str) {
		var n = str.length,
			idx = 0,
			bytes = [],
			i,
			j,
			c;
		
		for (i = 0; i < n; i = i + 1) {
			c = str.charCodeAt(i);
			if (c <= 0x7F) {
				bytes[idx] = c;
				idx = idx + 1;
			} else if (c <= 0x7FF) {
				bytes[idx] = 0xC0 | (c >>> 6);
				idx = idx + 1;
				bytes[idx] = 0x80 | (c & 0x3F);
				idx = idx + 1;
			} else if (c <= 0xFFFF) {
				bytes[idx] = 0xE0 | (c >>> 12);
				idx = idx + 1;
				bytes[idx] = 0x80 | ((c >>> 6) & 0x3F);
				idx = idx + 1;
				bytes[idx] = 0x80 | (c & 0x3F);
				idx = idx + 1;
			} else {
				bytes[idx] = 0xF0 | (c >>> 18);
				idx = idx + 1;
				bytes[idx] = 0x80 | ((c >>> 12) & 0x3F);
				idx = idx + 1;
				bytes[idx] = 0x80 | ((c >>> 6) & 0x3F);
				idx = idx + 1;
				bytes[idx] = 0x80 | (c & 0x3F);
				idx = idx + 1;
			}
		}
		return bytes;
	}
	
	/**
	 * メタバイナリの読み込み.
	 * @method loadMetaBinary
	 * @param {BLOB} binary バイナリデータ
	 * @param {Function} endCallback 終了時に呼ばれるコールバック
	 */
	function loadMetaBinary(binary, endCallback) {
		var reader = new FileReader();
		reader.addEventListener('loadend', function (e) {
			var buf = e.target.result,
				headstr = "MetaBin:",
				version,
				head,
				metasize,
				metaData,
				params = null,
				binary,
				pos = 0;
			
			if (!buf) { return; }
			if (buf.byteLength < headstr.length) { return; }
			head = arrayBufferToString(buf.slice(pos, pos + headstr.length));
			pos = pos + headstr.length;
			if (head !== 'MetaBin:') { return; }
			
			if (buf.byteLength < pos + 4) { return; }
			version = new Uint32Array(buf.slice(pos, pos + 4))[0];
			pos = pos + 4;
				
			if (buf.byteLength < pos + 4) { return; }
			metasize = new Uint32Array(buf.slice(pos, pos + 4))[0];
			pos = pos + 4;
			
			if (buf.byteLength < pos + metasize) { return; }
			metaData = arrayBufferToString(buf.slice(pos, pos + metasize));
			metaData = JSON.parse(metaData);
			pos = pos + metasize;
			
			if (metaData.hasOwnProperty('params')) {
				params = metaData.params;
			} else if (metaData.hasOwnProperty('result')) {
				params = metaData.result;
			}
			
			binary = buf.slice(pos, buf.byteLength);
			if (params !== null && params.type === 'text') {
				binary = arrayBufferToString(binary);
			}
			endCallback(metaData, binary);
		});
		reader.readAsArrayBuffer(binary);
	}
	
	/**
	 * メタバイナリの作成
	 * @method createMetaBinary
	 * @param {Object} metaData メタデータ
	 * @param {Object} data バイナリデータまたはUTF8文字列
	 * @return メタバイナリ
	 */
	function createMetaBinary(metaData, data) {
		var binary,
			metaDataStr = JSON.stringify(metaData),
			head = "MetaBin:",
			version,
			dstBufferSize,
			dstBuffer,
			view,
			binaryView,
			pos = 0,
			i,
			c,
			chars = new Uint8Array(utf8StringToArray(metaDataStr)),
			params;
		
		if (metaData.hasOwnProperty('params')) {
			params = metaData.params;
		} else if (metaData.hasOwnProperty('result')) {
			params = metaData.result;
		}
		
		if (params.type === 'url') {
			binary = utf8StringToArray(encodeURI(data));
			dstBufferSize = head.length + 8 + chars.length + binary.length;
		} else if (params.type === 'text') {
			binary = utf8StringToArray(data);
			dstBufferSize = head.length + 8 + chars.length + binary.length;
		} else {
			binary = data;
			dstBufferSize = head.length + 8 + chars.length + binary.byteLength;
		}
		dstBuffer = new ArrayBuffer(dstBufferSize);
		view = new DataView(dstBuffer);
		
		// head
		for (i = 0; i < head.length; i = i + 1) {
			view.setUint8(i, head.charCodeAt(i), true);
		}
		pos = pos + head.length;
		
		// version
		view.setUint32(pos, 1, true);
		pos = pos + 4;

		// metadata size
		view.setUint32(pos, chars.length, true);
		pos = pos + 4;
		
		// metadata
		for (i = pos; i < (pos + chars.length); i = i + 1) {
			view.setUint8(i, chars[i - pos], true);
		}
		pos = pos + chars.length;
		
		if (params.type === 'text' || params.type === 'url') {
			for (i = pos; i < dstBufferSize; i = i + 1) {
				view.setUint8(i, binary[i - pos], false);
			}
		} else {
			// binary
			binaryView = new DataView(binary);
			for (i = pos; i < dstBufferSize; i = i + 1) {
				view.setUint8(i, binaryView.getUint8(i - pos, true), true);
			}
		}
		return new Blob([dstBuffer], {type: "application/octet-stream"});
	}

	window.metabinary = metabinary;
	window.metabinary.loadMetaBinary = loadMetaBinary;
	window.metabinary.createMetaBinary = createMetaBinary;
}());

