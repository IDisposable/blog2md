# Blogger to Markdown

 Convert Blogger backup blog posts to hugo compatible markdown documents 


    Usage: node index.js b|w <BLOGGER BACKUP XML> <OUTPUT DIR>

For Blogger imports, blog posts and comments (as seperate file `<postname>-comments.md`) will be created in "`out`" directory

```
node index.js your-blogger-backup-export.xml out
```

If you want the comments to be merged in your post file itself. you can use flag `m` at the end. Defaults to `s` for seperate comments file. You can also drop the comments with flag 'd' at the end.

```
node index.js your-wordpress-backup-export.xml out m
```

## Installation (usual node project)

* Download or Clone this project
* `cd` to directory
* Run `npm install` to install dependencies
* Run `node index.js <arg...>`

## Notes to self

Script to convert posts from Blogger to Markdown.

- [x] Read XML
- [x] Parse Entries (Posts and comments) (with xpath?)
- [x] Parse Title, Link, Created, Updated, Content, Link
- [ ] List Post & Respective comment counts
- [x] Content to MD - pandoc?
- [ ] Parse Images, Files, Videos linked to the posts
- [x] Create output dir
- [ ] List items that are not downloaded( or can't) along with their .md file for user to proceed

## Why

* Liked what the original version did, but needed a bunch of tweaks so worth forking. Also don't care about WordPress exports, so killed that off.
* Needed to port my dead dead dead Blogger to Hugo.
