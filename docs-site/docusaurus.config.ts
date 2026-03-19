import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Baton",
  tagline: "The control plane for autonomous AI companies",
  favicon: "img/favicon.svg",

  future: {
    v4: true,
  },

  url: "https://atototo.github.io",
  baseUrl: "/baton/",

  organizationName: "atototo",
  projectName: "baton",
  trailingSlash: false,

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  markdown: {
    mermaid: true,
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en", "ko"],
    localeConfigs: {
      en: { label: "English" },
      ko: { label: "한국어" },
    },
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/atototo/baton/tree/main/docs-site/",
          routeBasePath: "/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ["@docusaurus/theme-mermaid"],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "baton",
      logo: {
        alt: "Baton",
        src: "img/logo-light.svg",
        srcDark: "img/logo-dark.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "getStarted",
          position: "left",
          label: "Get Started",
        },
        {
          type: "docSidebar",
          sidebarId: "guides",
          position: "left",
          label: "Guides",
        },
        {
          type: "docSidebar",
          sidebarId: "deploy",
          position: "left",
          label: "Deploy",
        },
        {
          type: "docSidebar",
          sidebarId: "adapters",
          position: "left",
          label: "Adapters",
        },
        {
          type: "docSidebar",
          sidebarId: "api",
          position: "left",
          label: "API Reference",
        },
        {
          type: "docSidebar",
          sidebarId: "cli",
          position: "left",
          label: "CLI",
        },
        {
          type: "localeDropdown",
          position: "right",
        },
        {
          href: "https://github.com/atototo/baton",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Quickstart", to: "/start/quickstart" },
            { label: "API Reference", to: "/api/overview" },
            { label: "CLI", to: "/cli/overview" },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/atototo/baton",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Baton. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "typescript"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
