'use strict';
/***
    Usage: blog2md b|w <BLOGGER/WordPress BACKUP XML> <OUTPUT DIR>
*/

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const sanitize = require('sanitize-filename');
const gfm_plugin = require('turndown-plugin-gfm');
const image_plugin = require('turndown-plugin-image-with-style');
const TurndownService = require('turndown');
var moment = require('moment');

var tds = new TurndownService({ codeBlockStyle: 'fenced', fence: '```' })
tds.use(gfm_plugin.gfm);
tds.use(image_plugin);

const highlightRegExp = /highlight-(?:text|source)-([a-z0-9]+)/;

const getExt = (node) => {
    // Simple match where the <pre> has the `highlight-source-js` tags
    const getClass = (node) => node.className || '';
    const match = getClass(node).match(highlightRegExp);

    if (match) return match[0].split("-").pop();

    if (node.parentNode) {
        // More complex match where the _parent_ (single) has that.
        // The parent of the <pre> is not a "wrapping" parent, so skip those
        if (node.parentNode.childNodes.length !== 1) return "";

        // Check the parent just in case
        const parent = getClass(node.parentNode).match(highlightRegExp);
        if (parent) return parent[0].split("-").pop();
    }

    // Nothing was found...
    return "";
};

const fencePreChildren = (content, node, options) => {
    const ext = getExt(node);
    const code = [...node.childNodes].map((c) => c.textContent).join("");
    return "\n" + options.fence + ext + "\n" + code + "\n" + options.fence + "\n\n";
}

tds.addRule("fenceAllPreformattedText", {
    filter: ["pre"],
    replacement: function (content, node, options) {
        console.log("ALL");
        return fencePreChildren(content, node, options);
    }
});

tds.addRule("unwrapPre", {
    filter: function (node) {
        var firstChild = node.firstElementChild;
        return (
            (node.nodeName === 'DIV' || node.nodeName === 'BLOCKQUOTE') &&
            firstChild &&
            firstChild.nodeName === 'PRE'
        )
    },
    replacement: function (content, node, options) {
        const pre = node.firstChild;
        return fencePreChildren(content, pre, options);
    },
});

if (process.argv.length < 3) {
    console.log(`Usage: blog2md <BACKUP XML> <OUTPUT DIR> m|s|d opts`)
    console.log(`\t m to merge comments`);
    console.log(`\t s to split comments`);
    console.log(`\t d to drop comments`);
    console.log(`\t opts feature flags:`);
    console.log(`\t\t yymm to turn emit in subdirectories by yyyy/mm from postdate`);
    console.log(`\t\t flagged to turn emit a blogImport flag`);

    return 1;
}

const inputFile = process.argv[2];
const outputDir = process.argv[3];
const commentOption = process.argv.length > 4 ? process.argv[4][0].toLowerCase() : 's';

const postdateDirectory = (process.argv.indexOf('yymm') >= 0);
const showDebug = (process.argv.indexOf('debug') >= 0);
const flagged = (process.argv.indexOf('flagged') >= 0);

if (fs.existsSync(outputDir)) {
    console.log(`WARNING: Given output directory "${outputDir}" already exists. Files will be overwritten.`)
}
else {
    fs.mkdirSync(outputDir);
}

if (commentOption == 'm') {
    console.log(`INFO: Comments requested to be merged along with posts. (m)`);
} else if (commentOption == 'd') {
    console.log(`INFO: Comments will be dropped. (d)`);
} else {
    console.log(`INFO: Comments requested to be a separate .md file(s - default)`);
}

bloggerImport(inputFile, outputDir);

function getFileName(text) {
    var newFileName = sanitize(text)     // first remove any dodgy characters
        .replace(/[\.']/g, '')       // then remove some known characters
        .replace(/[^a-z0-9]/gi, '-') // then turn anything that isn't a number or letter into a hyphen
        .replace(/[\-]{2,}/g, '-')   // then turn multiple hyphens into a single one
        .replace(/[\-]$/, '')        // truncate trailing hyphens
        .toLowerCase();              // finally make it all lower case
    return newFileName;
}

function bloggerImport(backupXmlFile, outputDir) {
    var parser = new xml2js.Parser();
    // __dirname + '/foo.xml'
    fs.readFile(backupXmlFile, function (err, data) {
        parser.parseString(data, function (err, result) {
            if (err) {
                console.log(`Error parsing xml file (${backupXmlFile})\n${JSON.stringify(err)}`); return 1;
            }
            // console.dir(JSON.stringify(result)); return;

            if (result.feed && result.feed.entry) {
                var contents = result.feed.entry;
                console.log(`Total no. of entries found : ${contents.length}`);

                var posts = contents.filter(function (entry) {
                    return entry.id[0].indexOf('.post-') != -1 && !entry['thr:in-reply-to']
                });

                var comments = contents.filter(function (entry) {
                    return entry.id[0].indexOf('.post-') != -1 && entry['thr:in-reply-to']
                });

                console.log(`Content-posts ${posts.length}`);
                console.log(`Content-Comments ${comments.length}\n\n`);

                var content = '';
                var markdown = '';
                var fileContent = '';
                var fileHeader = '';
                var postMaps = {};

                posts.forEach(function (entry) {
                    var postMap = {};

                    var title = entry.title[0]['_'];
                    // title = tds.turndown(title);
                    if (title && title.indexOf('"') != -1) {
                        title = title.replace(/"/g, '\\"');
                    }
                    postMap.pid = entry.id[0].split('-').pop()

                    const published = entry.published;
                    const updated = entry.updated;
                    const draft = (entry['app:control'] && (entry['app:control'][0]['app:draft'][0] == 'yes')) ? true : false;

                    var sanitizedTitle = getFileName(title)

                    var urlLink = entry.link.filter(function (link) {
                        return link["$"].type && link["$"].rel && link["$"].rel == 'alternate' && link["$"].type == 'text/html'
                    });

                    var url = ''

                    //debug_dir(urlLink[0]);
                    if (urlLink && urlLink[0] && urlLink[0]['$'] && urlLink[0]['$'].href) {
                        url = urlLink[0]['$'].href;
                    }

                    var subdir = '';
                    if (postdateDirectory) {
                        var parsed = new Date(Date.parse(published));
                        subdir = '/' + parsed.getFullYear() + '/' + (parsed.getMonth() + 1);
                    }

                    const fname = outputDir + subdir + '/' + path.basename(sanitizedTitle) + '.md';
                    postMap.postName = fname
                    postMap.fname = fname.replace('.md', '-comments.md');
                    postMap.comments = [];

                    if (entry.content && entry.content[0] && entry.content[0]['_']) {
                        content = entry.content[0]['_'];
                        markdown = tds.turndown(content);
                        // console.log(markdown);
                    }

                    const tagLabel = entry.category.filter(function (tag) {
                        //discard anything tagged against google schemas (like post)
                        return tag['$'].term && tag['$'].term.indexOf('http://schemas.google') == -1;
                    });

                    const tags = [];
                    tagLabel.forEach(function (tag) {
                        const term = tag['$'].term;
                        tags.push(term);
                    });

                    var tagString = `${tags.map(tag => '"' + tag + '"').join(',')}`;
                    debug(tagString);

                    const postAuthor = parseAuthor(entry);
                    var authorBlock = '[author]';
                    if (postAuthor.name) {
                        authorBlock += `\n\tname = '${postAuthor.name}'`;
                    }
                    if (postAuthor.url) {
                        authorBlock += `\n\turi = '${postAuthor.url}'`;
                    }
                    if (postAuthor.email && postAuthor.email != 'noreply@blogger.com') {
                        authorBlock += `\n\turi = '${postAuthor.email}'`;
                    }

                    var alias = url.replace(/^.*\/\/[^\/]+/, '');

                    fileHeader =
                        `title = "${title}"
date = ${published}
updated = ${updated}
draft = ${draft}${flagged ? "\nblogImport = true" : ""}
url = '${alias}'
tags = [${tagString}]
`;

                    if (false && authorBlock !== '[author') {
                        fileHeader += authorBlock + '\n';
                    }

                    fileContent = `+++\n${fileHeader}+++\n\n${markdown}\n`;

                    postMap.header = fileHeader;
                    console.debug(fileHeader);
                    postMaps[postMap.pid] = postMap;
                    console.log("\n\n");

                    writeToFile(fname, fileContent)
                });

                if (commentOption != 'd') {
                    comments.forEach(function (entry) {
                        // var commentMap = {};
                        const comment = { published: '', title: '', content: '' };

                        var postId = entry['thr:in-reply-to'][0]["$"]["source"];
                        postId = path.basename(postId);

                        comment.published = entry['published'][0];

                        if (entry['title'][0] && entry['title'][0]["_"]) {
                            comment.title = tds.turndown(entry['title'][0]["_"]);
                        }

                        if (entry['content'][0] && entry['content'][0]["_"]) {
                            comment.content = tds.turndown(entry['content'][0]["_"]);
                        }

                        comment.author = parseAuthor(entry);

                        postMaps[postId].comments.push(comment);
                    });
                }

                // console.log(JSON.stringify(postMaps)); return;
                writeComments(postMaps);
            }
            console.log('Done');
        });
    });
}

function parseAuthor(entry) {
    const author = { name: '', email: '', url: '' };

    if (entry['author'] && entry['author'][0]) {
        const post_author = entry['author'][0];

        if (["name"] && post_author["name"][0]) {
            author.name = post_author["name"][0];
        }

        if (post_author["email"] && post_author["email"][0]) {
            author.email = post_author["email"][0];
        }

        if (post_author["uri"] && post_author["uri"][0]) {
            author.url = post_author["uri"][0];
        }

        //if (post_author['gd:image'] && post_author['gd:image'][0]){
        //    author.image = post_author['gd:image'][0];//['$'];
        //}
    }

    debug_dir(author);
    return author;
}

function debug(message) {
    showDebug && console.debug('DEBUG: ' + message);
}

function debug_dir(obj) {
    showDebug && console.dir(obj);
}


function writeComments(postMaps) {
    for (var pmap in postMaps) {
        var comments = postMaps[pmap].comments;

        if (comments.length) {
            var ccontent = '';
            comments.forEach(function (comment) {
                var readableDate = '<time datetime="' + comment.published + '">' + moment(comment.published).format("MMM d, YYYY") + '</time>';

                ccontent += `#### ${comment.title}\n[${comment.author.name}](${comment.author.url} "${comment.author.email}") - ${readableDate}\n\n${comment.content}\n<hr />\n`;
            });

            if (commentOption == 'm') {
                writeToFile(postMaps[pmap].postName, `\n---\n### Comments:\n${ccontent}`, true);
            } else {
                writeToFile(postMaps[pmap].fname, `${postMaps[pmap].header}\n${ccontent}`);
            }
        }
    }
}

function writeToFile(filename, content, append = false) {
    let f = path.parse(filename);
    if (!fs.existsSync(f.dir))
        fs.mkdirSync(f.dir, { recursive: true });

    if (append) {
        debug(`going to append to ${filename}`);
        try {
            fs.appendFileSync(filename, content);
            debug(`Successfully appended to ${filename}`);
        }
        catch (err) {
            console.error(`ERROR: while appending to ${filename} - ${JSON.stringify(err)}`);
            console.dir(err);
        }
    } else {
        debug(`going to write to ${filename}`);
        try {
            fs.writeFileSync(filename, content);
            debug(`Successfully written to ${filename}`);
        }
        catch (err) {
            console.error(`ERROR: while writing to ${filename} - ${JSON.stringify(err)}`);
            console.dir(err);
        }
    }
}
