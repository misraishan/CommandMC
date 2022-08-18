"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChanelPointReward = void 0;
const auth_1 = require("@twurple/auth");
const api_1 = require("@twurple/api");
const chat_1 = require("@twurple/chat");
const eventsub_1 = require("@twurple/eventsub");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = require("fs");
const minecraft_server_util_1 = require("minecraft-server-util");
const db_1 = require("./db");
const app_1 = require("./website/app");
let api;
let listener;
// .env should contain: CLIENT_ID, CLIENT_SECRET, PORT, SECRET
dotenv_1.default.config({ path: "../.env" });
const clientId = process.env["CLIENT_ID"];
const clientSecret = process.env["CLIENT_SECRET"];
// Minecraft Client
const mcClient = new minecraft_server_util_1.RCON();
// Create an auto refreshing token 
// File tokens.json should hold {accessToken, refreshToken, expiresIn, obtainmentTimestamp}
async function getAuthProvider() {
    const tokenData = JSON.parse(await fs_1.promises.readFile("../tokens.json", "utf-8"));
    const authProvider = new auth_1.RefreshingAuthProvider({
        clientId,
        clientSecret,
        onRefresh: async (newTokenData) => await fs_1.promises.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), "utf-8")
    }, tokenData);
    return authProvider;
}
async function main() {
    // Create an App Access Token necessary for Event Sub
    const appTokenAuthProvider = new auth_1.ClientCredentialsAuthProvider(clientId, clientSecret);
    const apiClient = new api_1.ApiClient({ authProvider: appTokenAuthProvider });
    /* Create adapter and web server for bot to listen on
    * adapter provides the webserver domain and SSL, however SSL is obtained with a reverse proxy
    */
    const adapter = new eventsub_1.EnvPortAdapter({ hostName: 'express.hayhay.cc' });
    const secret = process.env["SECRET"];
    listener = new eventsub_1.EventSubListener({ apiClient, adapter, secret, strictHostCheck: false });
    await listener.listen().then(() => listener.removeListener());
    const authProvider = await getAuthProvider();
    // Creates chatClient to respond to users.
    const chatClient = new chat_1.ChatClient({ authProvider: authProvider, channels: ['HayHayIsLive'] });
    await chatClient.connect();
    // Creates new ApiClient to create channel point redemptions.
    // Required scopes: channel:manage:redemptions
    api = new api_1.ApiClient({ authProvider });
    // Gets all users and for each users loops through commands to create custom rewards + add listener.
    await db_1.db.user.findMany({ include: { commands: true } }).then((userList) => {
        userList.forEach(async (usr) => {
            usr.commands.forEach(async (command) => {
                await createChanelPointReward(usr.id, command);
            });
        });
    });
}
async function createChanelPointReward(userId, command) {
    try {
        if (command.reward_id == null) {
            const reward = await api.channelPoints.createCustomReward(userId, { title: command.name, cost: command.cost | 1000, userInputRequired: true });
            const update = await db_1.db.commands.update({
                where: { id: command.id },
                data: {
                    reward_id: reward.id,
                }
            });
        }
        return createListener(userId, command.reward_id);
    }
    catch (error) { }
}
exports.createChanelPointReward = createChanelPointReward;
async function createListener(userId, rewardId) {
    try {
        await listener.subscribeToChannelRedemptionAddEvents(userId, (data) => {
            console.log(data.input);
        });
    }
    catch (error) {
        console.log(error);
    }
}
async function doCommand() { }
main();
app_1.app.listen(3050);
