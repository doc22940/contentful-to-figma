var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const SPACING = 20;
const requests = {};
const imageCache = {};
figma.showUI(__html__, {
    width: 500,
    height: 400
});
// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
figma.ui.onmessage = (msg) => __awaiter(this, void 0, void 0, function* () {
    const { data } = tryParse(msg);
    console.log(msg.type);
    if (msg.type === 'notify') {
        return figma.notify(msg.data);
    }
    if (msg.type === 'close') {
        figma.closePlugin();
        return;
    }
    if (requests[msg.id]) {
        requests[msg.id].resolve(data);
        return;
    }
    if (msg.type === 'request:selection') {
        for (var i = 0; i < 10; ++i) {
            const selection = getOriginalSelection();
            if (selection) {
                return responseMessage(msg, [fromSelection(selection)]);
            }
            yield delay(1000);
        }
        const selection = getOriginalSelection();
        if (selection) {
            return responseMessage(msg, [fromSelection(selection)]);
        }
        return responseMessage(msg, []);
    }
    if (msg.type === 'request:saveContentfulSpace') {
        figma.notify('space saved');
        setPluginJSON('contentfulSpace', data || '');
        responseMessage(msg, 'ok');
        return;
    }
    if (msg.type === 'request:saveContentfulData') {
        setPluginJSON('contentfulData', data || []);
        responseMessage(msg, 'ok');
        return;
    }
    if (msg.type === 'request:renderContentful') {
        const { items, contentfulConfig } = data;
        const { mapping, images } = contentfulConfig;
        const limit = contentfulConfig.limit || 100;
        const spacing = parseInt(contentfulConfig.spacing) || 20;
        const grid = ['columns', 'grid'].indexOf(contentfulConfig.grid) !== -1
            ? contentfulConfig.grid
            : 'rows';
        const columnCount = contentfulConfig.grid === 'grid'
            ? parseInt(contentfulConfig.columns) || 3
            : contentfulConfig.grid === 'columns'
                ? 100
                : 1;
        const rowCount = Math.ceil(limit / columnCount) || 1;
        const original = getOriginalSelection();
        if (!original) {
            responseMessage(msg, 'sync:selection');
            console.log('selection', figma.currentPage.selection);
            return figma.notify('No frame selected');
        }
        setPluginJSON('contentfulConfig', contentfulConfig);
        const instance = getFrame(original);
        if (!instance) {
            responseMessage(msg, 'sync:selection');
            console.log('selection', figma.currentPage.selection);
            return figma.notify('No frame selected');
        }
        if (!items) {
            console.warn('no rows', items);
            responseMessage(msg, 'error');
            return figma.notify('No data from Contentful');
        }
        if (!mapping.find(col => col.contentfulField)) {
            console.warn('no fields mapped', mapping);
            responseMessage(msg, 'error');
            return figma.notify('No fields mapped');
        }
        const textLookup = getArrayMapping(original, mapping);
        const imageLookup = getArrayMapping(original, images);
        yield loadFonts(mapping);
        const instanceId = instance.id;
        instance.setPluginData('clonedFrom', instanceId);
        const parent = instance.parent;
        const focus = [];
        focus.push(instance);
        let y = instance.y;
        let x = instance.x;
        let height = instance.height;
        let width = instance.width;
        let first = true;
        let i = 0;
        for (let r = 0; r < rowCount; r++) {
            for (let c = 0; c < columnCount && i < items.length && i < limit; c++) {
                const entryData = items[i];
                console.log('entryData', entryData);
                const clone = first
                    ? instance
                    : instance.type === 'COMPONENT'
                        ? fromComponent(instance)
                        : instance.clone();
                first = false;
                const subs = clone.findAll(() => true);
                // console.log('subs', subs)
                subs.forEach((sub, i) => interpolateText(sub, entryData.fields[textLookup[i]]));
                subs.forEach((sub, i) => interpolateImage(sub, entryData.fields[imageLookup[i]]));
                parent.appendChild(clone);
                clone.y = y + (height + spacing) * r;
                clone.x = x + (width + spacing) * c;
                clone.setPluginData('clonedFrom', instanceId);
                // clone.locked = true
                focus.push(clone);
                i++;
            }
        }
    }
    function loadFonts(mapping) {
        return Promise.all(mapping.map(node => figma.getNodeById(node.id)).map(loadFont));
    }
    function interpolateImage(node, value) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('image: ', value);
            if (value && value.fields && value.fields.file && value.fields.file.url) {
                const image = yield downloadImage(`https:${value.fields.file.url}`);
                const paint = JSON.parse(JSON.stringify(node.fills[0]));
                paint.imageHash = figma.createImage(new Uint8Array(image)).hash;
                node.fills = [paint].concat(node.fills.slice(1));
                return;
            }
        });
    }
    function fromComponent(parent) {
        const instance = parent.createInstance();
        // To the right
        instance.x = parent.x + parent.width + SPACING;
        instance.y = parent.y;
        return instance;
    }
    function loadFont(node) {
        return node.type === 'TEXT' && figma.loadFontAsync(node.fontName);
    }
    function fromSelection(node) {
        return {
            id: node.id,
            type: node.type,
            contentfulSpace: getPluginJSON(node, 'space'),
            contentfulData: getPluginJSON(node, 'contentfulData'),
            contentfulConfig: getPluginJSON(node, 'contentfulConfig'),
            texts: getTexts(node),
            images: getImages(node)
        };
    }
    function responseMessage(msg, data) {
        figma.ui.postMessage({
            id: msg.id,
            type: msg.type.replace('request:', 'response:'),
            data: JSON.stringify(data)
        });
    }
    function getOriginalSelection() {
        const instance = figma.currentPage.selection[0];
        if (!instance) {
            return instance;
        }
        if (instance.type !== 'INSTANCE' &&
            instance.type !== 'FRAME' &&
            instance.type !== 'COMPONENT') {
            return null;
        }
        const id = instance.getPluginData('clonedFrom');
        return (id && figma.getNodeById(id)) || instance;
    }
    function interpolateText(node, value) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('text: ', value);
            if (value) {
                const { name } = node;
                node.characters = String(value);
                if (node.name === node.characters) {
                    node.name = name;
                }
                return;
            }
        });
    }
    function downloadImage(url) {
        if (!imageCache[url]) {
            imageCache[url] = requestMessage('downloadImage', url);
        }
        return imageCache[url];
    }
    function templateHash(text, data) {
        if (data) {
            Object.keys(data).forEach(key => {
                text = text.replace('#' + key, data[key]);
            });
        }
        return text;
    }
    function tryParse(msg) {
        try {
            return {
                type: msg.type,
                data: JSON.parse(msg.data)
            };
        }
        catch (e) { }
        return msg || {};
    }
    function getPluginJSON(node, key) {
        const data = node.getPluginData(key);
        try {
            return JSON.parse(data);
        }
        catch (e) { }
        return data;
    }
    function setPluginJSON(key, data) {
        ;
        []
            .concat(figma.currentPage.selection, getOriginalSelection())
            .filter(Boolean)
            .map(node => {
            node.setPluginData(key, JSON.stringify(data));
        });
    }
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function getTexts(layer) {
        if (!layer)
            return [];
        const texts = [];
        traverse(layer, layer => {
            if (layer.type === 'TEXT') {
                texts.push({
                    id: layer.id,
                    name: layer.name,
                    characters: layer.characters
                });
            }
        });
        return texts;
    }
    function getImages(layer) {
        if (!layer)
            return [];
        const images = [];
        traverse(layer, layer => {
            if (layer.fills && layer.fills[0] && layer.fills[0].type === 'IMAGE') {
                images.push({
                    id: layer.id,
                    name: layer.name,
                    imageHash: layer.fills[0].imageHash
                });
            }
        });
        return images;
    }
    function traverse(node, func) {
        if (Array.isArray(node)) {
            return node.map(n => traverse(n, func));
        }
        func(node);
        if ('children' in node) {
            for (const child of node.children) {
                traverse(child, func);
            }
        }
    }
    function getFrame(instance) {
        if (!instance) {
            return console.warn('no selection');
        }
        console.log('clonedfrm', instance, instance.getPluginData('clonedFrom'));
        // Start from cloned node
        const id = instance.getPluginData('clonedFrom');
        const node = figma.getNodeById(id);
        if (node && id && id !== instance.id) {
            console.log('indirect instance');
            instance = node;
        }
        else if (id && !node) {
            console.log('old clone');
            instance.setPluginData('clonedFrom', null);
        }
        if (node) {
            const toRemove = [];
            const id = instance.id;
            traverse(figma.currentPage, node => {
                if (node.getPluginData('clonedFrom') === id && node.id !== id) {
                    toRemove.push(node);
                }
            });
            toRemove.forEach(node => node.remove());
            // console.log('toremo', toRemove.length)
        }
        if (!instance ||
            (instance.type !== 'INSTANCE' &&
                instance.type !== 'FRAME' &&
                instance.type !== 'COMPONENT')) {
            return console.warn('no instance');
        }
        return instance;
    }
    function getArrayMapping(instance, mapping) {
        return instance
            .findAll(() => true)
            .map(node => mapping.find(n => n.id === node.id))
            .map(f => f && f.contentfulField);
    }
    function requestMessage(type, data) {
        // Store all requests in one object and handle in global onmessage
        const id = Math.random().toString(36);
        return new Promise(resolve => {
            console.log('requestmessage', type, data);
            requests[id] = { resolve };
            figma.ui.postMessage({
                id,
                type: 'request:' + type,
                data: JSON.stringify(data)
            });
        });
    }
});
