import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Mircea Anton',
  tagline: 'DevOps by day, HomeOps by night!',
  favicon: 'img/favicon.ico',

  url: 'https://mirceanton.com',
  baseUrl: '/',

  organizationName: 'mirceanton', 
  projectName: 'website',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/mirceanton/website/mirceanton'
        },
        blog: {
          routeBasePath: "/",
          tagsBasePath: "/tags",
          archiveBasePath: "/archive",
          authorsBasePath: "/authors",
          blogSidebarTitle: "Recent Posts:",
          showReadingTime: true,
          // showLastUpdateAuthor: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl: 'https://github.com/mirceanton/website/mirceanton',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/banner.png',

    navbar: {
      title: 'Mircea Anton',
      hideOnScroll: true,
      logo: {
        alt: 'mirceanton Logo',
        src: 'img/icon.png',
      },
      items: [
        {to: '/blog', label: 'Blog', position: 'left'},
        {to: '/docs/intro', label: 'Docs', position: 'left'},
        {
          href: 'https://github.com/facebook/docusaurus',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },

    footer: {
      style: "light",
      links: [
        {
          title: 'Projects',
          items: [
            {
              label: 'Tutorial',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/docusaurus',
            },
            {
              label: 'Discord',
              href: 'https://discordapp.com/invite/docusaurus',
            },
            {
              label: 'X',
              href: 'https://x.com/docusaurus',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/facebook/docusaurus',
            },
          ],
        },
      ],
      logo: {
        alt: 'mirceanton text logo',
        src: 'img/footer.png',
        href: 'https://mirceanton.com',
      },
      copyright: `© ${new Date().getFullYear()} <b>Mircea-Pavel Anton</b> Some rights reserved`,
    },

    prism: {
      theme: prismThemes.gruvboxMaterialLight,
      darkTheme: prismThemes.gruvboxMaterialDark,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
