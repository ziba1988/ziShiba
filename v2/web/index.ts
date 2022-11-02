import Mousetrap from 'mousetrap';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeReact from 'rehype-react';
import { createElement, Fragment } from 'react';
import { mount } from './components';

interface Ipc {
    postMessage(m: string): void;
}

declare global {
    interface Window {
        ShibaApp: Shiba;
        ipc: Ipc;
    }
}

type MessageFromMain =
    | {
          kind: 'content';
          content: string;
      }
    | {
          kind: 'key_mappings';
          keymaps: { [keybind: string]: string };
      }
    | {
          kind: 'debug';
      };
type MessageToMain =
    | {
          kind: 'init';
      }
    | {
          kind: 'forward';
      }
    | {
          kind: 'back';
      }
    | {
          kind: 'reload';
      }
    | {
          kind: 'file_dialog';
      }
    | {
          kind: 'dir_dialog';
      };

function sendMessage(m: MessageToMain): void {
    window.ipc.postMessage(JSON.stringify(m));
}

let debug: (...args: unknown[]) => void = function nop() {};

const KEYMAP_ACTIONS: { [action: string]: () => void } = {
    ScrollDown(): void {
        window.scrollBy(0, window.innerHeight / 2);
    },
    ScrollUp(): void {
        window.scrollBy(0, -window.innerHeight / 2);
    },
    ScrollLeft(): void {
        window.scrollBy(-window.innerWidth / 2, 0);
    },
    ScrollRight(): void {
        window.scrollBy(window.innerWidth / 2, 0);
    },
    ScrollPageDown(): void {
        window.scrollBy(0, window.innerHeight);
    },
    ScrollPageUp(): void {
        window.scrollBy(0, -window.innerHeight);
    },
    Forward(): void {
        sendMessage({ kind: 'forward' });
    },
    Back(): void {
        sendMessage({ kind: 'back' });
    },
    Reload(): void {
        sendMessage({ kind: 'reload' });
    },
    OpenFile(): void {
        sendMessage({ kind: 'file_dialog' });
    },
    OpenDir(): void {
        sendMessage({ kind: 'dir_dialog' });
    },
    ScrollTop(): void {
        window.scrollTo(0, 0);
    },
    ScrollBottom(): void {
        window.scrollTo(0, document.body.scrollHeight);
    },
};

defaultSchema.attributes!['*']!.push('className'); // Allow `class` attribute in all HTML elements

const remark = unified()
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeHighlight, { plainText: ['txt', 'text'] })
    .use(rehypeSanitize, defaultSchema)
    .use(rehypeReact, { createElement, Fragment });

const nop = () => {};

class Shiba {
    private onMarkdownContent: (elem: any) => any;

    constructor() {
        this.onMarkdownContent = nop;
    }

    registerContentCallback(callback: (elem: any) => void) {
        if (this.onMarkdownContent === nop) {
            sendMessage({ kind: 'init' });
        }
        this.onMarkdownContent = callback;
    }

    async receive(msg: MessageFromMain): Promise<void> {
        debug('Received IPC message from main:', msg.kind, msg);

        // This method must not throw exception since the main process call this method like `window.ShibaApp.receive(msg)`.
        try {
            switch (msg.kind) {
                case 'content':
                    const file = await remark.process(msg.content);
                    this.onMarkdownContent(file.result);
                    break;
                case 'key_mappings':
                    for (const [keybind, action] of Object.entries(msg.keymaps)) {
                        const callback = KEYMAP_ACTIONS[action];
                        if (callback) {
                            Mousetrap.bind(keybind, e => {
                                e.preventDefault();
                                e.stopPropagation();
                                debug('Triggered key shortcut:', action);
                                callback();
                            });
                        } else {
                            console.error('Unknown action:', action);
                        }
                    }
                    document.getElementById('preview')?.focus();
                    document.getElementById('preview')?.click();
                    break;
                case 'debug':
                    debug = console.debug;
                    debug('Debug log is enabled');
                    break;
                default:
                    console.error('Unknown message:', msg);
                    break;
            }
        } catch (err) {
            console.error('Error while handling received IPC message', err, msg);
        }
    }
}

window.ShibaApp = new Shiba(); // The main process sends events via `window.ShibaApp` global variable
mount(document.getElementById('shiba-root')!);
