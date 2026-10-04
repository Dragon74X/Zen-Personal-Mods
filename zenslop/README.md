# Zenslop

A live preview of the playing video, shown above Zen's media controls in the
sidebar, with optional captions and a button to hide it.

This is a maintained fork of [Firebolt9907/Zenslop](https://github.com/Firebolt9907/Zenslop)
by Rishu Sharma, taken from its 1.2.0 release. The fork exists because the
original's `theme.json` has no `updatedAt`, so Sine never offers its updates:
installs stayed on 1.1.1, which breaks on Zen 1.23b and leaves padding under
the tab list that cannot be used to move the window.

## Install

Remove the original Zenslop first, then add this folder's URL in Sine. Your
settings carry over: the preference names are unchanged.

## Changes from the original

- Releases carry `updatedAt`, so Sine updates them like the other mods here.
- Internal names (window actor, resource alias, controller) are its own, so it
  cannot collide with the original if both are ever installed.
- The mod finds its folder through Sine's registered chrome URL instead of a
  hardcoded profile path, so it works under Sine and Cosine alike.
- Groupflow refits its folders when the preview resizes the tab list.

## Settings

| Setting | Default |
|---|---|
| Video quality | 360p |
| Preview frame rate | 15 fps |
| Captions | Follow YouTube |
| Show captions when the preview is hidden | off |

## License

The MIT License (MIT)

Copyright (c) 2026 Rishu Sharma

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
