import Layout from "@theme/Layout";
import { Redirect } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout>
      <Redirect to={`${siteConfig.baseUrl}start/quickstart`} />
    </Layout>
  );
}
