import { createClient, TogglProject, TogglEntry } from "./toggl";
import ical from "ical-generator";
import { ICalEventStatus } from "ical-generator";
import { IncomingMessage, ServerResponse } from "http";
import moment from "moment";
import url from "url";
import querystring from "querystring";

interface TogglEntryWithProject extends TogglEntry {
  project: TogglProject | null;
}

async function getData({ token }: { token: string }) {
  const toggl = createClient({ token });

  const loadProjectById = toggl.projectByIdLoaderFactory();

  const entries = await toggl.getEntries({
    start_date: moment().subtract(120, "months").toDate(),
    end_date: moment().toDate(),
  });

  const entriesWithProjects = await Promise.all(
    entries.map(async (entry) => {
      let project: TogglProject | null = null;
      if (entry.pid) {
        project = await loadProjectById(entry.pid!);
      }

      return {
        ...entry,
        project,
      };
    })
  );

  return {
    entries: entriesWithProjects,
  };
}

function createCal(
  { entries }: { entries: TogglEntryWithProject[] },
  workspace: string
) {
  const cal = ical({
    name: "Toggl time entries",
    domain: "daohsong.com",
  });

  for (const entry of entries) {
    const durationInHoursRounded =
      Math.round((entry.duration / 60 / 60) * 10) / 10;

    const duration =
      durationInHoursRounded > 0 ? `${durationInHoursRounded}h` : "n/a";

    const projectName = entry.project ? entry.project.name : "n/a";
    if (!(projectName == workspace)) {
      continue;
    }

    let description = "";

    const tags = entry.tags ? entry.tags : [];

    let summary = ``;
    let url = "";
    if (entry.description) {
      summary = entry.description.split(" |")[0];
      if (entry.description.split(" |").length > 1) {
        url = "omnifocus:///task/" + entry.description.split(" |")[1];
      }
    }

    for (const tag of tags) {
      description += `\n #${tag}`;
    }
    // description += workspace;
    const event = cal.createEvent({
      start: moment(entry.start).add(1, "minutes").seconds(0),
      end: moment(entry.stop),
      summary: summary,
      description: description,
      // categories: [{ name: "haha" }],
    });
    // event.description({
    //   plain: description,
    //   html: "<p>" + description + "<p>",
    // });
    event.location(url);
    // event.status(ICalEventStatus.CONFIRMED);
    // event.categories();
  }

  return cal;
}

export default async (req: IncomingMessage, res: ServerResponse) => {
  const parts = url.parse(req.url!);
  // const { token } = querystring.parse(parts.query || "");
  const params = querystring.parse(parts.query || "");

  // if (typeof params !== "string") {
  //   res.writeHead(400);
  //   res.end('Missing query parameter "token"');
  //   return;
  // }
  const token = params.token ? params.token : "";
  const workspace = params.workspace ? params.workspace : "";

  const data = await getData({ token });

  if (parts.pathname === "/index.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(data, null, 4));
    return;
  }

  const cal = createCal(data, workspace);

  cal.serve(res);
};
