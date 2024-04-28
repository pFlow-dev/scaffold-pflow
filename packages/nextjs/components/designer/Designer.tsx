import React, { useEffect, useState } from "react";
import { MetaModel } from "../../pflow";
import Model from "./Model";

// import { Address } from "~~/components/scaffold-eth";

interface DesignerProps {
  metaModel: MetaModel;
}

function useWindowSize() {
  // Initialize state with undefined width/height so server and client renders match
  // Learn more here: https://joshwcomeau.com/react/the-perils-of-rehydration/
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    // only execute all the code below in client side
    // Handler to call on window resize
    function handleResize() {
      // Set window width/height to state
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    // Add event listener
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    // return () => window.removeEventListener("resize", handleResize);
  }, []);
  return windowSize;
}

export default function Designer(props: DesignerProps): React.ReactElement {
  const { metaModel } = props;
  const onClick = async (evt: React.MouseEvent) => {
    return props.metaModel.editorClick(evt);
  };

  const svgWidth = useWindowSize().width;

  // REVIEW: embed other components
  // <foreignObject id="designer-canvas" x={0} y={0} width={"100%"} height={metaModel.height}>
  //   <canvas id="pflow-canvas" width={svgWidth} height={metaModel.height}/>
  // </foreignObject>

  return (
    <React.Fragment>
      <svg id="pflow-svg-outer" width={svgWidth} height={metaModel.height} onClick={onClick}>
        <svg id="pflow-svg" width={svgWidth} height={metaModel.height} onContextMenu={evt => evt.preventDefault()}>
          <defs>
            <marker id="markerArrow1" markerWidth="23" markerHeight="13" refX="31" refY="6" orient="auto">
              <rect className="arrowSpace1" width="28" height="3" fill="#ffffff" stroke="#ffffff" x="3" y="5" />
              <path d="M2,2 L2,11 L10,6 L2,2" />
            </marker>
            <marker id="markerInhibit1" markerWidth="23" markerHeight="13" refX="31" refY="6" orient="auto">
              <rect className="inhibitSpace1" width="28" height="3" fill="#ffffff" stroke="#ffffff" x="3" y="5" />
              <circle cx="5" cy="6.5" r={4} />
            </marker>
          </defs>
          <Model metaModel={metaModel} />
        </svg>
      </svg>
    </React.Fragment>
  );
}
