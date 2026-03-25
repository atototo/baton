import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import clsx from "clsx";

import styles from "./docs.module.css";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";
type StepState = "pending" | "active" | "done" | "blocked" | "warning";

type Action = {
  label: ReactNode;
  href?: string;
  to?: string;
  external?: boolean;
  icon?: ReactNode;
};

type BulletItem = ReactNode;

export type StoryHeroProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  bullets?: BulletItem[];
  actions?: Action[];
  visual?: ReactNode;
  stats?: { value: ReactNode; label: ReactNode }[];
  className?: string;
};

export function StoryHero({
  eyebrow,
  title,
  description,
  bullets,
  actions,
  visual,
  stats,
  className,
}: StoryHeroProps) {
  return (
    <section className={clsx(styles.storyHero, className)}>
      <div className={styles.storyHeroInner}>
        <div className={styles.storyHeroCopy}>
          {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
          <h1 className={styles.title}>{title}</h1>
          {description ? <p className={styles.description}>{description}</p> : null}
          {bullets?.length ? (
            <ul className={styles.heroBullets}>
              {bullets.map((bullet, index) => (
                <li key={index}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {actions?.length ? (
            <div className={styles.heroActions}>
              {actions.map((action, index) => {
                const content = (
                  <>
                    {action.icon ? action.icon : null}
                    <span>{action.label}</span>
                  </>
                );

                if (action.to) {
                  return (
                    <Link key={index} className={styles.heroAction} to={action.to}>
                      {content}
                    </Link>
                  );
                }

                return (
                  action.href ? (
                    <a
                      key={index}
                      className={styles.heroAction}
                      href={action.href}
                      target={action.external ? "_blank" : undefined}
                      rel={action.external ? "noreferrer" : undefined}
                    >
                      {content}
                    </a>
                  ) : (
                    <span key={index} className={styles.heroAction}>
                      {content}
                    </span>
                  )
                );
              })}
            </div>
          ) : null}
        </div>

        <div className={styles.storyHeroPanel}>
          <div className={styles.storyHeroPanelGlow} />
          {visual ? (
            <div className={styles.surfaceFrame}>{visual}</div>
          ) : (
            <div className={styles.storyHeroFallback} aria-hidden="true">
              <div className={styles.storyHeroFallbackBar} data-size="lg" />
              <div className={styles.storyHeroFallbackBar} data-size="md" />
              <div className={styles.storyHeroFallbackCards}>
                <div className={styles.storyHeroFallbackCard} data-tone="primary" />
                <div className={styles.storyHeroFallbackCard} data-tone="success" />
                <div className={styles.storyHeroFallbackCard} data-tone="warning" />
              </div>
              <div className={styles.storyHeroFallbackBar} data-size="sm" />
            </div>
          )}
          {stats?.length ? (
            <div className={styles.statGrid}>
              {stats.map((stat, index) => (
                <div key={index} className={styles.statCard}>
                  <div className={styles.statValue}>{stat.value}</div>
                  <div className={styles.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export type FlowStep = {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  state?: StepState;
};

export type FlowStepperProps = {
  steps: FlowStep[];
  className?: string;
};

export function FlowStepper({ steps, className }: FlowStepperProps) {
  return (
    <section className={clsx(styles.stepper, className)}>
      <div className={styles.stepperList}>
        {steps.map((step, index) => (
          <article key={index} className={styles.stepCard}>
            <div className={styles.stepMarker} data-state={step.state ?? "pending"}>
              {index + 1}
            </div>
            <div className={styles.stepBody}>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              {step.description ? <p className={styles.stepDescription}>{step.description}</p> : null}
              {step.meta ? <div className={styles.stepMeta}>{step.meta}</div> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type ControlPlaneNode = {
  title: ReactNode;
  description?: ReactNode;
  tone?: Tone;
};

export type ControlPlaneDiagramProps = {
  center: ControlPlaneNode;
  top?: ControlPlaneNode[];
  right?: ControlPlaneNode[];
  bottom?: ControlPlaneNode[];
  left?: ControlPlaneNode[];
  className?: string;
};

function ControlPlaneNodeCard({ node }: { node: ControlPlaneNode }) {
  return (
    <div className={styles.controlPlaneNode} data-tone={node.tone ?? "neutral"}>
      <h3 className={styles.controlPlaneNodeTitle}>{node.title}</h3>
      {node.description ? <p className={styles.controlPlaneNodeDescription}>{node.description}</p> : null}
    </div>
  );
}

export function ControlPlaneDiagram({
  center,
  top,
  right,
  bottom,
  left,
  className,
}: ControlPlaneDiagramProps) {
  return (
    <section className={clsx(styles.controlPlane, className)}>
      <div className={clsx(styles.controlPlaneSide, styles.controlPlaneTop)}>
        {top?.map((node, index) => <ControlPlaneNodeCard key={index} node={node} />)}
      </div>
      <div className={clsx(styles.controlPlaneSide, styles.controlPlaneLeft)}>
        {left?.map((node, index) => <ControlPlaneNodeCard key={index} node={node} />)}
      </div>
      <div className={styles.controlPlaneCenter}>
        <h3 className={styles.controlPlaneCenterTitle}>{center.title}</h3>
        {center.description ? (
          <p className={styles.controlPlaneCenterDescription}>{center.description}</p>
        ) : null}
      </div>
      <div className={clsx(styles.controlPlaneSide, styles.controlPlaneRight)}>
        {right?.map((node, index) => <ControlPlaneNodeCard key={index} node={node} />)}
      </div>
      <div className={clsx(styles.controlPlaneSide, styles.controlPlaneBottom)}>
        {bottom?.map((node, index) => <ControlPlaneNodeCard key={index} node={node} />)}
      </div>
    </section>
  );
}

export type GovernedFlowStage = {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  state?: StepState;
};

export type GovernedFlowTimelineProps = {
  stages: GovernedFlowStage[];
  className?: string;
};

export function GovernedFlowTimeline({ stages, className }: GovernedFlowTimelineProps) {
  return (
    <section className={clsx(styles.timeline, className)}>
      <div className={styles.timelineList}>
        {stages.map((stage, index) => (
          <article key={index} className={styles.timelineItem}>
            <div className={styles.timelineTrack}>
              <div className={styles.timelineMarker} data-state={stage.state ?? "pending"}>
                {index + 1}
              </div>
            </div>
            <div className={styles.timelineBody}>
              <h3 className={styles.timelineTitle}>{stage.title}</h3>
              {stage.description ? <p className={styles.timelineDescription}>{stage.description}</p> : null}
              {stage.meta ? <div className={styles.timelineMeta}>{stage.meta}</div> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export type StateLifecycleStage = {
  label: ReactNode;
  tone?: StepState;
};

export type StateLifecycleProps = {
  states: StateLifecycleStage[];
  branch?: {
    label: ReactNode;
    description?: ReactNode;
    tone?: Tone;
  };
  className?: string;
};

export function StateLifecycle({ states, branch, className }: StateLifecycleProps) {
  return (
    <section className={clsx(styles.stateLifecycle, className)}>
      <div className={styles.statePath}>
        {states.map((state, index) => (
          <span key={index} className={styles.stateNode} data-tone={state.tone ?? "pending"}>
            {state.label}
            {index < states.length - 1 ? <span className={styles.stateArrow}>→</span> : null}
          </span>
        ))}
      </div>
      {branch ? (
        <div className={styles.stateBranch} data-tone={branch.tone ?? "neutral"}>
          <div className={styles.stateBranchLabel}>{branch.label}</div>
          {branch.description ? <div className={styles.stateBranchBody}>{branch.description}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

export type ScreenTourStep = {
  title: ReactNode;
  description?: ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  caption?: ReactNode;
  badge?: ReactNode;
  layout?: "left" | "right";
};

export type ScreenTourProps = {
  steps: ScreenTourStep[];
  className?: string;
};

export function ScreenTour({ steps, className }: ScreenTourProps) {
  return (
    <section className={clsx(styles.screenTour, className)}>
      <div className={styles.screenTourList}>
        {steps.map((step, index) => {
          const media = step.imageSrc ? (
            <img className={styles.screenTourImage} src={step.imageSrc} alt={step.imageAlt ?? ""} />
          ) : (
            <div className={styles.screenTourPlaceholder}>Visual placeholder</div>
          );

          return (
            <article key={index} className={styles.screenTourStep} data-layout={step.layout ?? "left"}>
              <div className={styles.screenTourHeading}>
                {step.badge ? <div className={styles.eyebrow}>{step.badge}</div> : null}
                <h3 className={styles.screenTourTitle}>{step.title}</h3>
                {step.description ? <p className={styles.screenTourDescription}>{step.description}</p> : null}
              </div>
              <div className={styles.screenTourMedia}>{media}</div>
              {step.caption ? <div className={styles.screenTourCaption}>{step.caption}</div> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export type ComparePane = {
  title: ReactNode;
  summary?: ReactNode;
  bullets?: ReactNode[];
  footer?: ReactNode;
  tone?: Tone;
};

export type CompareModesProps = {
  left: ComparePane;
  right: ComparePane;
  className?: string;
};

function ComparePaneView({ pane }: { pane: ComparePane }) {
  return (
    <div className={styles.comparePane} data-tone={pane.tone ?? "neutral"}>
      <h3 className={styles.comparePaneTitle}>{pane.title}</h3>
      {pane.summary ? <p className={styles.comparePaneSummary}>{pane.summary}</p> : null}
      {pane.bullets?.length ? (
        <ul className={styles.compareList}>
          {pane.bullets.map((bullet, index) => (
            <li key={index}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {pane.footer ? <div className={styles.compareFooter}>{pane.footer}</div> : null}
    </div>
  );
}

export function CompareModes({ left, right, className }: CompareModesProps) {
  return (
    <section className={clsx(styles.compareModes, className)}>
      <ComparePaneView pane={left} />
      <ComparePaneView pane={right} />
    </section>
  );
}

export type CalloutCard = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  tone?: Tone;
};

export type CalloutGridProps = {
  cards: CalloutCard[];
  className?: string;
};

export function CalloutGrid({ cards, className }: CalloutGridProps) {
  return (
    <section className={clsx(styles.calloutGrid, className)}>
      {cards.map((card, index) => (
        <article key={index} className={styles.calloutCard} data-tone={card.tone ?? "neutral"}>
          {card.eyebrow ? <div className={styles.calloutEyebrow}>{card.eyebrow}</div> : null}
          <h3 className={styles.calloutTitle}>{card.title}</h3>
          {card.description ? <p className={styles.calloutDescription}>{card.description}</p> : null}
          {card.footer ? <div className={styles.calloutFooter}>{card.footer}</div> : null}
        </article>
      ))}
    </section>
  );
}

export type ScreenshotCallout = {
  title: ReactNode;
  description?: ReactNode;
  tone?: Tone;
  marker?: ReactNode;
};

export type AnnotatedScreenshotProps = {
  imageSrc: string;
  imageAlt: string;
  callouts: ScreenshotCallout[];
  title?: ReactNode;
  description?: ReactNode;
  imageCaption?: ReactNode;
  imageBadge?: ReactNode;
  layout?: "image-left" | "image-right";
  className?: string;
};

export function AnnotatedScreenshot({
  imageSrc,
  imageAlt,
  callouts,
  title,
  description,
  imageCaption,
  imageBadge,
  layout = "image-left",
  className,
}: AnnotatedScreenshotProps) {
  return (
    <section className={clsx(styles.annotatedScreenshot, className)} data-layout={layout}>
      {(title || description) && (
        <div className={styles.annotatedScreenshotHeader}>
          {title ? <h3 className={styles.annotatedScreenshotTitle}>{title}</h3> : null}
          {description ? <p className={styles.annotatedScreenshotDescription}>{description}</p> : null}
        </div>
      )}

      <div className={styles.annotatedScreenshotBody}>
        <figure className={styles.annotatedScreenshotFigure}>
          <div className={styles.annotatedScreenshotMedia}>
            <img className={styles.annotatedScreenshotImage} src={imageSrc} alt={imageAlt} />
            {imageBadge ? (
              <div className={styles.annotatedScreenshotBadgeRow} aria-hidden="true">
                <span className={styles.annotatedScreenshotBadge}>{imageBadge}</span>
              </div>
            ) : null}
          </div>
          {imageCaption ? <figcaption className={styles.annotatedScreenshotCaption}>{imageCaption}</figcaption> : null}
        </figure>

        <ol className={styles.annotatedScreenshotCallouts}>
          {callouts.map((callout, index) => (
            <li key={index} className={styles.annotatedScreenshotCallout} data-tone={callout.tone ?? "neutral"}>
              <div className={styles.annotatedScreenshotMarker}>{callout.marker ?? index + 1}</div>
              <div className={styles.annotatedScreenshotCalloutBody}>
                <h4 className={styles.annotatedScreenshotCalloutTitle}>{callout.title}</h4>
                {callout.description ? (
                  <p className={styles.annotatedScreenshotCalloutDescription}>{callout.description}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export type { Tone, StepState };
