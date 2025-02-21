console.log('VITE_SERVER_ADDRESS:', import.meta.env.VITE_SERVER_ADDRESS);

const config = {
  serverAddress: import.meta.env.VITE_SERVER_ADDRESS || 'localhost:8080',
};

export default config;
