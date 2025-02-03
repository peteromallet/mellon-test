const config = {
  serverAddress: import.meta.env.VITE_SERVER_ADDRESS || window.location.origin.split('://')[1],
};

export default config;
