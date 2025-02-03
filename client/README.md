# Mellon Client

This is the development client for the [Mellon](https://github.com/cubiq/Mellon) engine. It is built with [ReactFlow](https://reactflow.dev/), [Typescript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/) and [MUI](https://mui.com/).

> [!CAUTION]
> This is mostly a proof of concept and not a production ready application. **DO NOT USE** unless you know what you are doing. Things will change often.

## Install

```bash
git clone https://github.com/cubiq/Mellon-client.git
cd Mellon-client
npm install
```

Then create a `.env.development` file and put the server address in it, like so (change the address/port if needed):

```
VITE_SERVER_ADDRESS=127.0.0.1:8080
```

Rename `vite.config.example.ts` to `vite.config.ts` and customize it if needed. For example if your vite installation is on a remote host you could add a `server` section:

```
  server: {
    hmr: true,
    watch: {
      usePolling: true,
    },
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
```

Then you can start the development server with:

```bash
npm run dev
```

**Remember** to `npm install` every time `package.json` is updated!

When done you need to run `npm run build` and copy the compiled directory into the `web` folder of [Mellon](https://github.com/cubiq/Mellon) server.

## Contact

I'm not a React, Typescript, ReactFlow or MUI expert (first time using all of them together). I just hacked this together. Any help would be appreciated.

At this stage the best way to contact me regarding the project is via [X/Twitter](https://x.com/cubiq) or [discord](https://latent.vision/discord).
