import axios from "axios";

const chatbot = {
  send: async (message, model = "gpt-4o-mini") => {
    try {
      const modelx = [
        "gpt-3.5-turbo",
        "gpt-3.5-turbo-0125",
        "gpt-4o-mini",
        "gpt-4o",
      ];
      if (!modelx.includes(model)) {
        throw new Error(
          "Model nya kagak valid! Pilih salah satu: " + modelx.join(", ")
        );
      }
      const payload = {
        messages: message,
        model: model,
      };
      const response = await axios
        .post(
          "https://mpzxsmlptc4kfw5qw2h6nat6iu0hvxiw.lambda-url.us-east-2.on.aws/process",
          payload,
          {
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Postify/1.0.0",
            },
          }
        )
        .catch((e) => e.response);
      return response.data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  },
};

export default (handler) => {
  handler.reg({
    cmd: ["websearch", "wb"],
    tags: "main",
    desc: "Search on Internet",
    run: async (m, { sock }) => {
      if (!m.text) return m.reply("Yang Mau Dicari Apa?");
      let data = await chatbot.send(
        [
          {
            role: "system",
            content:
              "Kamu sekarang adalah NekoBot, Bot asisten yang diciptakan oleh Lorenzxz",
          },
          {
            role: "user",
            content: m.text,
          },
        ],
        "gpt-3.5-turbo"
      );

      if (!data.choices) return m.reply("> Gagal mendapatkan respons dari ChatGPT");
      m.reply(data.choices[0].message.content.trim());
    },
  });
};
