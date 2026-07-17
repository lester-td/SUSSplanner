import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    {
      path: "/api/feedback",
      method: "POST",
      advancedOptions: {
        checkLevel: "basic",
      },
    },
  ],
});
