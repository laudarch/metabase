import userEvent from "@testing-library/user-event";

import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
  setupSchemaEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { findRequests } from "__support__/utils";
import { UndoListing } from "metabase/containers/UndoListing";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
  createMockTable,
} from "metabase-types/api/mocks";
import type { UploadsSettings } from "metabase-types/api/settings";
import { createMockState } from "metabase-types/store/mocks";

import {
  UploadSettingsForm,
  UploadSettingsFormView,
} from "./UploadSettingsForm";

const TEST_DATABASES = [
  createMockDatabase({
    id: 1,
    name: "Db Uno",
    engine: "postgres",
    tables: [
      // we need to mock these tables so that it mocks the schema endpoint
      createMockTable({ schema: "public" }),
      createMockTable({ schema: "uploads" }),
      createMockTable({ schema: "top_secret" }),
    ],
    features: ["schemas"],
  }),
  createMockDatabase({
    id: 2,
    name: "Db Dos",
    engine: "mysql",
  }),
  createMockDatabase({
    id: 3,
    name: "Db Tres",
    engine: "h2",
    tables: [createMockTable({ schema: "public" })],
    features: ["schemas"],
  }),
  createMockDatabase({
    id: 5,
    name: "Db Cinco",
    engine: "h2",
    tables: [],
    features: ["schemas"],
  }),
] as Database[];

interface SetupOpts {
  databases?: Database[];
  uploadsSettings?: UploadsSettings;
  isHosted?: boolean;
}

function setup({
  databases = TEST_DATABASES,
  uploadsSettings = {
    db_id: null,
    schema_name: null,
    table_prefix: null,
  },
  isHosted = false,
}: SetupOpts = {}) {
  const state = createMockState({
    entities: createMockEntitiesState({ databases }),
    settings: mockSettings({
      "is-hosted?": isHosted,
    }),
  });

  databases.forEach((db) => {
    setupSchemaEndpoints(db);
  });

  const updateSpy = jest.fn(() => Promise.resolve({ error: "" }));

  renderWithProviders(
    <>
      <UploadSettingsFormView
        databases={databases}
        uploadsSettings={uploadsSettings}
        updateSetting={updateSpy}
      />
      <UndoListing />
    </>,
    { storeInitialState: state },
  );
  return { updateSpy };
}

async function setupOuter({
  databases = TEST_DATABASES,
  uploadsSettings = {
    db_id: null,
    schema_name: null,
    table_prefix: null,
  },
  isHosted = false,
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "is-hosted?": isHosted,
    "uploads-settings": uploadsSettings,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupDatabaseListEndpoint(databases);

  databases.forEach((db) => {
    setupSchemaEndpoints(db);
  });

  renderWithProviders(
    <>
      <UploadSettingsForm />
      <UndoListing />
    </>,
  );

  await waitForLoaderToBeRemoved();
}

describe("Admin > Settings > UploadSettingsFormView", () => {
  it("should render a description", async () => {
    setup();
    expect(
      screen.getByText("Allow people to upload data to collections"),
    ).toBeInTheDocument();
  });

  it("should show an empty state if there are no databases", async () => {
    setup({ databases: [] });
    expect(
      screen.getByText(
        "None of your databases are compatible with this version of the uploads feature.",
      ),
    ).toBeInTheDocument();
  });

  it("should populate a dropdown of schema for schema-enabled DBs", async () => {
    setup();
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    const dbItem = await screen.findByText("Db Uno");
    await userEvent.click(dbItem);
    await screen.findByDisplayValue("1");

    const schemaDropdown =
      await screen.findByPlaceholderText("Select a schema");
    await waitFor(() => expect(schemaDropdown).toBeEnabled());
    await userEvent.click(schemaDropdown);

    expect(await screen.findByText("public")).toBeInTheDocument();
    expect(await screen.findByText("uploads")).toBeInTheDocument();
    expect(await screen.findByText("top_secret")).toBeInTheDocument();
  });

  it("should be able to submit a db + schema combination selection", async () => {
    const { updateSpy } = setup();
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    const dbItem = await screen.findByText("Db Uno");
    await userEvent.click(dbItem);
    await screen.findByDisplayValue("1");

    const schemaDropdown =
      await screen.findByPlaceholderText("Select a schema");
    await waitFor(() => expect(schemaDropdown).toBeEnabled());
    await userEvent.click(schemaDropdown);

    const schemaItem = await screen.findByText("uploads");

    await userEvent.click(schemaItem);

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      key: "uploads-settings",
      toast: false,
      value: {
        db_id: 1,
        schema_name: "uploads",
        table_prefix: null,
      },
    });
  });

  it("should be able to submit a table prefix for databases without schema", async () => {
    const { updateSpy } = setup();
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    const dbItem = await screen.findByText("Db Dos");
    await userEvent.click(dbItem);
    await screen.findByDisplayValue("2");

    const prefixInput = await screen.findByPlaceholderText("upload_");

    await userEvent.clear(prefixInput);
    await userEvent.type(prefixInput, "my_prefix_");

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      key: "uploads-settings",
      toast: false,
      value: {
        db_id: 2,
        schema_name: null,
        table_prefix: "my_prefix_",
      },
    });
  });

  it("should be able to submit a table prefix for databases with schema", async () => {
    const { updateSpy } = setup();
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    const dbItem = await screen.findByText("Db Uno");
    await userEvent.click(dbItem);
    await screen.findByDisplayValue("1");

    const schemaDropdown =
      await screen.findByPlaceholderText("Select a schema");
    await waitFor(() => expect(schemaDropdown).toBeEnabled());
    await userEvent.click(schemaDropdown);

    const schemaItem = await screen.findByText("uploads");
    await userEvent.click(schemaItem);

    const prefixInput = await screen.findByPlaceholderText("upload_");
    await userEvent.clear(prefixInput);
    await userEvent.type(prefixInput, "my_prefix_");

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      key: "uploads-settings",
      toast: false,
      value: {
        db_id: 1,
        schema_name: "uploads",
        table_prefix: "my_prefix_",
      },
    });
  });

  it("should show enabled toast", async () => {
    setup();
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    const dbItem = await screen.findByText("Db Dos");
    await userEvent.click(dbItem);

    const prefixInput = await screen.findByPlaceholderText("upload_");

    await userEvent.clear(prefixInput);
    await userEvent.type(prefixInput, "my_prefix_");

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    await expectToast("Uploads enabled");
  });

  it("should show an error if enabling fails", async () => {
    const { updateSpy } = setup();
    updateSpy.mockImplementation(() => Promise.resolve({ error: "oh no!" }));
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    const dbItem = await screen.findByText("Db Dos");
    await userEvent.click(dbItem);

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      key: "uploads-settings",
      toast: false,
      value: {
        db_id: 2,
        schema_name: null,
        table_prefix: null,
      },
    });

    await expectToast(/There was a problem/);
  });

  it("should be able to disable uploads", async () => {
    const { updateSpy } = setup({
      uploadsSettings: {
        db_id: 2,
        schema_name: null,
        table_prefix: null,
      },
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Disable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      key: "uploads-settings",
      toast: false,
      value: {
        db_id: null,
        schema_name: null,
        table_prefix: null,
      },
    });
  });

  it("should show an error if disabling fails", async () => {
    const { updateSpy } = setup({
      uploadsSettings: {
        db_id: 2,
        schema_name: null,
        table_prefix: null,
      },
    });
    updateSpy.mockImplementation(() => Promise.resolve({ error: "oh no!" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Disable uploads" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      key: "uploads-settings",
      toast: false,
      value: {
        db_id: null,
        schema_name: null,
        table_prefix: null,
      },
    });

    await expectToast(/There was a problem/i);
  });

  it("should populate db and schema from existing settings", async () => {
    setup({
      uploadsSettings: {
        db_id: 1,
        schema_name: "top_secret",
        table_prefix: null,
      },
    });

    // mantine select puts 2 inputs in, 1 is hidden
    expect(await screen.findByDisplayValue("Db Uno")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("1")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getAllByDisplayValue("top_secret")).toHaveLength(2),
    );
  });

  it("should populate db and stable prefix from existing settings", async () => {
    setup({
      uploadsSettings: {
        db_id: 2,
        schema_name: null,
        table_prefix: "my_uploads_",
      },
    });

    // mantine select puts 2 inputs in, 1 is hidden
    expect(await screen.findByDisplayValue("Db Dos")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("2")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("my_uploads_")).toBeInTheDocument();
  });

  it("should show a message if there are no schema for the selected db", async () => {
    setup({
      uploadsSettings: {
        db_id: null,
        schema_name: null,
        table_prefix: null,
      },
    });
    const dbItem = await screen.findByPlaceholderText("Select a database");
    await userEvent.click(dbItem);
    await userEvent.click(await screen.findByText("Db Cinco"));

    expect(
      await screen.findByText(/We couldn't find any schema/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Enable uploads" }),
    ).toBeDisabled();
  });

  it("should be able to update db settings", async () => {
    const { updateSpy } = setup({
      uploadsSettings: {
        db_id: 2,
        schema_name: null,
        table_prefix: null,
      },
    });
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    const dbItem = await screen.findByText("Db Uno");
    await userEvent.click(dbItem);
    await screen.findByDisplayValue("1");

    expect(
      screen.queryByRole("button", { name: "Enable uploads" }),
    ).not.toBeInTheDocument();
    const updateButton = await screen.findByRole("button", {
      name: "Update settings",
    });
    expect(updateButton).toBeInTheDocument();
    expect(updateButton).toBeDisabled(); // because no schema is selected

    const schemaDropdown =
      await screen.findByPlaceholderText("Select a schema");
    await waitFor(() => expect(schemaDropdown).toBeEnabled());
    await userEvent.click(schemaDropdown);

    const schemaItem = await screen.findByText("uploads");
    await userEvent.click(schemaItem);

    await userEvent.click(
      await screen.findByRole("button", { name: "Update settings" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      key: "uploads-settings",
      toast: false,
      value: {
        db_id: 1,
        schema_name: "uploads",
        table_prefix: null,
      },
    });
  });

  describe("button states", () => {
    it("should show disabled enable button when no db is selected", async () => {
      setup();
      expect(
        await screen.findByRole("button", { name: "Enable uploads" }),
      ).toBeDisabled();
    });

    it("should show disabled enable button when no schema is selected", async () => {
      setup();
      await userEvent.click(
        await screen.findByPlaceholderText("Select a database"),
      );

      const dbItem = await screen.findByText("Db Uno");
      await userEvent.click(dbItem);

      expect(
        await screen.findByRole("button", { name: "Enable uploads" }),
      ).toBeDisabled();
    });

    it("should show enabled disable button when a db is populated", async () => {
      setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: null,
        },
      });
      expect(
        await screen.findByRole("button", { name: "Disable uploads" }),
      ).toBeEnabled();
    });

    it("should enable the enable button when a schemaless db is selected", async () => {
      setup();
      await userEvent.click(
        await screen.findByPlaceholderText("Select a database"),
      );

      const dbItem = await screen.findByText("Db Dos");
      await userEvent.click(dbItem);

      expect(
        await screen.findByRole("button", { name: "Enable uploads" }),
      ).toBeEnabled();
    });

    it("should show the only the update button when a db is changed", async () => {
      setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: null,
        },
      });
      await userEvent.click(
        await screen.findByPlaceholderText("Select a database"),
      );

      const dbItem = await screen.findByText("Db Uno");
      await userEvent.click(dbItem);
      await screen.findByDisplayValue("1");

      expect(
        screen.queryByRole("button", { name: "Enable uploads" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Disable uploads" }),
      ).not.toBeInTheDocument();
      const updateButton = await screen.findByRole("button", {
        name: "Update settings",
      });
      expect(updateButton).toBeInTheDocument();
      expect(updateButton).toBeDisabled(); // because no schema is selected

      const schemaDropdown =
        await screen.findByPlaceholderText("Select a schema");
      await userEvent.click(schemaDropdown);

      const schemaItem = await screen.findByText("uploads");
      await userEvent.click(schemaItem);

      expect(updateButton).toBeEnabled(); // now that a schema is selected
    });

    it("should show the update button when a table prefix is changed", async () => {
      setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: "up_",
        },
      });

      const prefixInput = await screen.findByPlaceholderText("upload_");
      await userEvent.clear(prefixInput);
      await userEvent.type(prefixInput, "my_prefix_");

      expect(
        await screen.findByRole("button", { name: "Update settings" }),
      ).toBeEnabled();
    });

    it("should show a loading spinner on submit", async () => {
      const { updateSpy } = setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: "up_",
        },
      });
      updateSpy.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );

      const prefixInput = await screen.findByPlaceholderText("upload_");
      await userEvent.clear(prefixInput);
      await userEvent.type(prefixInput, "my_prefix_");

      const updateButton = await screen.findByRole("button", {
        name: "Update settings",
      });
      await userEvent.click(updateButton);
      expect(
        await screen.findByTestId("loading-indicator"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update settings" }),
      ).not.toBeInTheDocument();
    });

    it("should reset button loading state on input change", async () => {
      const { updateSpy } = setup({
        uploadsSettings: {
          db_id: 2,
          schema_name: null,
          table_prefix: "up_",
        },
      });
      updateSpy.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );

      const prefixInput = await screen.findByPlaceholderText("upload_");
      await userEvent.clear(prefixInput);
      await userEvent.type(prefixInput, "my_prefix_");

      const updateButton = await screen.findByRole("button", {
        name: "Update settings",
      });
      await userEvent.click(updateButton);
      expect(
        await screen.findByTestId("loading-indicator"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update settings" }),
      ).not.toBeInTheDocument();

      await userEvent.clear(prefixInput);
      await userEvent.type(prefixInput, "_2");
      expect(
        screen.getByRole("button", { name: "Update settings" }),
      ).toBeInTheDocument();
    });
  });

  it("should show a warning for h2 databases", async () => {
    setup();
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    await userEvent.click(await screen.findByText("Db Cinco")); // h2

    expect(
      screen.getByText(/uploads to the Sample Database are for testing only/i),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Additional terms apply."),
    ).not.toBeInTheDocument();
  });

  it("should show an extended warning for h2 databases on hosted instances", async () => {
    setup({ isHosted: true });
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    await userEvent.click(await screen.findByText("Db Cinco")); // h2

    expect(
      screen.getByText(/uploads to the Sample Database are for testing only/i),
    ).toBeInTheDocument();

    await userEvent.hover(screen.getByText("Additional terms apply."));
    expect(
      within(await screen.findByRole("tooltip")).getByText(
        /By enabling uploads to the Sample Database, you agree that you will not upload or otherwise transmit any individually identifiable information/,
      ),
    ).toBeInTheDocument();
  });
});

describe("Admin > Settings > UploadSettingsForm", () => {
  it("should re-fetch databases after update", async () => {
    await setupOuter({
      uploadsSettings: {
        db_id: null,
        schema_name: null,
        table_prefix: null,
      },
    });
    await userEvent.click(
      await screen.findByPlaceholderText("Select a database"),
    );

    const dbItem = await screen.findByText("Db Uno");
    await userEvent.click(dbItem);
    await screen.findByDisplayValue("1");

    const schemaDropdown =
      await screen.findByPlaceholderText("Select a schema");
    await waitFor(() => expect(schemaDropdown).toBeEnabled());
    await userEvent.click(schemaDropdown);

    const schemaItem = await screen.findByText("uploads");

    await userEvent.click(schemaItem);

    const gets = await findRequests("GET");
    const databaseGets = gets.filter((req) =>
      req.url.includes("/api/database"),
    );
    expect(databaseGets).toHaveLength(2);

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable uploads" }),
    );

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);

    const gets2 = await findRequests("GET");
    const databaseGets2 = gets2.filter((req) =>
      req.url.includes("/api/database"),
    );
    expect(databaseGets2).toHaveLength(3);
  });
});

const expectToast = async (text: string | RegExp) => {
  return waitFor(() => {
    const undo = screen.getByTestId("undo-list");
    expect(within(undo).getByText(text)).toBeInTheDocument();
  });
};
