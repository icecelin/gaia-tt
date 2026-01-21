'use client';

import { getLayoutedElements } from '@/lib/elkjs';
import { HighlightedElements, UiNode, GroupingMode } from '@/lib/types';
import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  MarkerType,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Legend } from './Legend';
import { LoadingSpinner } from './LoadingSpinner';
import { GroupSelector } from './GroupSelector';
import { CustomNode } from './CustomNode';
import TabPanel from './TabPanel';
import EditInterface from './EditInterface';
import { useTechTree } from '@/hooks/useTechTree';

// Suppress hydration warnings for Radix UI
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Hydration failed') &&
      args[0].includes('aria-controls')
    ) {
      return;
    }
    originalError.apply(console, args);
  };
}

const TechTree: React.FC = () => {
  const { techTree, isLoading: isLoadingData, error } = useTechTree();
  const [isLoading, setIsLoading] = useState(true);
  const [nodes, setNodes] = useState<UiNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<UiNode | undefined>(undefined);
  const [highlightedElements, setHighlightedElements] = useState<HighlightedElements>({
    nodeIds: new Set(),
    edgeIds: new Set(),
  });
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('None');
  const [showingRelatedNodes, setShowingRelatedNodes] = useState<string | null>(null);
  const [showOnlyConnected, setShowOnlyConnected] = useState<boolean>(false);
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isEditing, setIsEditing] = useState(false);
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const { fitView } = useReactFlow();

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error Loading Data</h2>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const handleEnterEditMode = () => {
    const password = prompt('Please enter the admin password:');
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setIsEditing(true);
    } else if (password !== null) {
      alert('Incorrect password.');
    }
  };

  const handleExitEditMode = () => {
    if (window.confirm('Are you sure you want to exit edit mode? Any unsaved changes will be lost.')) {
      setIsEditing(false);
    }
  };

  // Function to find connected nodes and edges
  const findConnectedElements = useCallback(
    (nodeId: string, allEdges: Edge[]) => {
      const connectedNodeIds = new Set<string>();
      const connectedEdgeIds = new Set<string>();

      connectedNodeIds.add(nodeId);

      allEdges.forEach((edge) => {
        if (edge.source === nodeId || edge.target === nodeId) {
          connectedEdgeIds.add(edge.id);
          if (edge.source === nodeId) {
            connectedNodeIds.add(edge.target);
          }
          if (edge.target === nodeId) {
            connectedNodeIds.add(edge.source);
          }
        }
      });

      return { nodeIds: connectedNodeIds, edgeIds: connectedEdgeIds };
    },
    [],
  );

  useEffect(() => {
    setSearchTerm(searchInput);
  }, [searchInput, searchTerm]);

  const categories = useMemo(() => {
    if (!techTree) return [];

    const unique = new Set<string>();
    for (const node of techTree.nodes) {
      const raw = (node.data as Record<string, unknown>).category;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed) unique.add(trimmed);
      }
    }

    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [techTree]);

  const filteredTechTree = useMemo(() => {
    if (!techTree) return null;
    if (selectedCategory === 'All') return techTree;

    const matchingNodes = techTree.nodes.filter((node) => {
      const raw = (node.data as Record<string, unknown>).category;
      return typeof raw === 'string' && raw.trim() === selectedCategory;
    });
    const visibleIds = new Set(matchingNodes.map((n) => n.id));
    const matchingEdges = techTree.edges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
    );

    return { nodes: matchingNodes, edges: matchingEdges };
  }, [techTree, selectedCategory]);

  useEffect(() => {
    if (!filteredTechTree) return;

    const loadLayout = async () => {
      setIsLoading(true);
      const { layoutedNodes, layoutedEdges } = await getLayoutedElements(
        groupingMode,
        showingRelatedNodes,
        showOnlyConnected,
        searchTerm,
        filteredTechTree,
      );
      setNodes(() => layoutedNodes);
      setEdges(() => layoutedEdges);
      setIsLoading(false);
      fitView();
    };

    loadLayout();
  }, [
    fitView,
    groupingMode,
    showingRelatedNodes,
    showOnlyConnected,
    searchTerm,
    filteredTechTree,
  ]);

  // Update node and edge styles based on highlighted elements
  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        style: {
          ...node.style,
          borderWidth: highlightedElements.nodeIds.has(node.id) ? '3px' : '1px',
          boxShadow: highlightedElements.nodeIds.has(node.id)
            ? '0 0 0 2px #f97316'
            : 'none',
          fontWeight: highlightedElements.nodeIds.has(node.id)
            ? 'bold'
            : 'normal',
        },
      })),
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        style: {
          ...edge.style,
          strokeWidth: highlightedElements.edgeIds.has(edge.id) ? 3 : 1,
          stroke: highlightedElements.edgeIds.has(edge.id)
            ? '#f97316'
            : '#374151',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: highlightedElements.edgeIds.has(edge.id)
            ? '#f97316'
            : '#374151',
        },
      })),
    );
  }, [highlightedElements]);

  const handleShowDetails = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        setSelectedNode(() => ({ ...node }));
        const connected = findConnectedElements(nodeId, edges);
        setHighlightedElements(connected);
        
        // Auto-expand panel on mobile when node details are shown
        if (window.innerWidth < 768) {
          setIsPanelExpanded(true);
        }
      }
    },
    [nodes, edges, findConnectedElements],
  );

  const handleShowConnected = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        setSelectedNode(() => ({ ...node }));
        setShowingRelatedNodes(nodeId);
        setShowOnlyConnected(true);
        setSearchInput('');
        setSearchTerm('');
        setHighlightedElements({ nodeIds: new Set(), edgeIds: new Set() });
      }
    },
    [nodes],
  );

  const handleGroupingModeChange = useCallback((mode: GroupingMode) => {
    setGroupingMode(mode);
    setSelectedNode(undefined);
    setShowingRelatedNodes(null);
    setShowOnlyConnected(false);
    setHighlightedElements({ nodeIds: new Set(), edgeIds: new Set() });
  }, []);

  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category);
    setSelectedNode(undefined);
    setShowingRelatedNodes(null);
    setShowOnlyConnected(false);
    setHighlightedElements({ nodeIds: new Set(), edgeIds: new Set() });
  }, []);

  const handleReset = useCallback(() => {
    setSelectedNode(undefined);
    setShowingRelatedNodes(null);
    setShowOnlyConnected(false);
    setSearchInput('');
    setSearchTerm('');
    setHighlightedElements({ nodeIds: new Set(), edgeIds: new Set() });
    setSelectedCategory('All');
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    setSelectedNode(undefined);
    setShowingRelatedNodes(null);
    setShowOnlyConnected(false);
    setHighlightedElements({ nodeIds: new Set(), edgeIds: new Set() });
  }, []);

  return (
    <div className="w-full h-screen bg-gray-100 flex">
      <div className={`relative transition-all duration-300 flex flex-col h-screen ${
        isPanelExpanded 
          ? 'w-full md:w-2/4'
          : 'w-full'
      }`}>
        <GroupSelector
          currentMode={groupingMode}
          onModeChange={handleGroupingModeChange}
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={handleCategoryChange}
          selectedNode={selectedNode}
          showingConnectedNodes={showingRelatedNodes !== null}
          onReset={handleReset}
          searchInput={searchInput}
          onSearchChange={handleSearchChange}
          onEnterEditMode={handleEnterEditMode}
          isEditing={isEditing}
          showLegend={showLegend}
          showOptions={showOptions}
          onToggleLegend={() => setShowLegend(!showLegend)}
          onToggleOptions={() => setShowOptions(!showOptions)}
        />
        {isLoadingData || isLoading ? (
          <div className="flex-grow flex items-center justify-center h-full">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="flex-grow relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={{
                default: (props) => (
                  <CustomNode
                    {...props}
                    onShowDetails={handleShowDetails}
                    onShowConnected={handleShowConnected}
                  />
                ),
              }}
              onNodesChange={undefined}
              onEdgesChange={undefined}
              onConnect={undefined}
              onEdgeClick={undefined}
              onNodeDragStop={undefined}
              draggable={false}
              nodesConnectable={false}
              colorMode={'light'}
              fitView
              fitViewOptions={{ padding: 0.5 }}
              minZoom={0.3}
              className="h-full w-full"
            >
              <Background bgColor="white" variant={BackgroundVariant.Dots} />
              {/* Controls positioned at bottom on desktop, below legend buttons on mobile */}
              <Controls 
                showInteractive={false} 
                showZoom={true} 
                showFitView={true}
                className="!left-4 !top-[180px] !bottom-auto md:!top-auto md:!bottom-4"
              />
            </ReactFlow>
            {/* Legend - hidden on mobile by default, shown via button */}
            <div className={`${showLegend ? 'block' : 'hidden'} md:block`}>
              <Legend />
            </div>
          </div>
        )}
      </div>
      <div 
        className={`bg-white shadow-lg transition-all duration-300 relative ${
          isPanelExpanded 
            ? 'w-full md:w-2/4'
            : 'w-0'
        } ${
          isPanelExpanded ? 'fixed md:relative inset-0 md:inset-auto z-40 md:z-auto' : ''
        }`}
      >
        {isEditing ? (
          <EditInterface onExit={handleExitEditMode} />
        ) : (
          <TabPanel 
            selectedNode={selectedNode} 
            techTree={techTree}
            isPanelExpanded={isPanelExpanded}
            onTogglePanel={() => setIsPanelExpanded(!isPanelExpanded)}
          />
        )}
      </div>
    </div>
  );
};

export default TechTree;